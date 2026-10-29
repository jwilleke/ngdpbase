/**
 * FeedScheduler (#685 slice 6) — decides which configured feeds are due and
 * fetches them. It keeps no timer (#2109): the background job `feeds.poll`
 * (BackgroundJobManager, every minute by default; `ngdpbase.jobs.feeds.poll.schedule`
 * changes it) calls {@link FeedScheduler.pass} with its job context, and each
 * due source's fetch runs under that context with its own stated reason.
 *
 * - Cadence: `intervalMinutes` (default 60) or `dailyAt` 'HH:MM'.
 * - Back-off: consecutive failures multiply the effective interval (capped), so
 *   a flapping endpoint isn't hammered; reset on success.
 * - Stale-feed WARN: when a source hasn't succeeded within the staleness window,
 *   emit one admin notification (via the injected notifier) until it recovers.
 * - Isolation (#1955): due sources ingest concurrently, at most
 *   `maxConcurrent` at once (`ngdpbase.addons.feeds.max-concurrent-ingests`),
 *   so a source whose upstream hangs until its timeout holds no other source.
 *   A source is never run beside itself: it is marked running when queued.
 *
 * Clock + notifier + ingest are injected, so the whole policy is unit-testable
 * without real timers or network.
 */

import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
import type { JobContext } from '../../../dist/src/context/JobContext.js';
import type { FeedSourceConfig } from './types.js';
import type { UpsertResult } from './RecordStore.js';
import { FEED_SETTING_DEFAULTS } from './config.js';

const MINUTE_MS = 60_000;
const DEFAULT_INTERVAL_MINUTES = 60;
const MAX_BACKOFF_MULTIPLIER = 6; // cap effective interval at 6× base
const STALENESS_MULTIPLIER = 3;   // warn after 3× the base interval with no success
const FAILURES_BEFORE_NEVER_SUCCEEDED_STALE = 3;

export interface SchedulerNotification { level: string; title: string; message: string }
export type SchedulerNotify = (n: SchedulerNotification) => void;
/** One source's fetch, as the context it runs under (P1). */
export type IngestFn = (sourceId: string, ctx: JobContext) => Promise<UpsertResult>;

/** What one pass started: the sources it found due, and when their fetches are all done. */
export interface SchedulerPass {
  started: string[];
  done: Promise<void>;
}

export interface FeedSchedulerOptions {
  now?: () => number;
  notify?: SchedulerNotify;
  defaultIntervalMinutes?: number;
  /** Most sources ingesting at once (#1955). */
  maxConcurrent?: number;
}

interface SourceState {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  failures: number;
  running: boolean;
  staleWarned: boolean;
}

export class FeedScheduler {
  private readonly now: () => number;
  private readonly notify: SchedulerNotify;
  private readonly defaultIntervalMinutes: number;
  private readonly maxConcurrent: number;
  /** Ingests holding a slot now, and the queued ones waiting for a slot. */
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly state = new Map<string, SourceState>();

  /**
   * @param logger - The host's logger (#1813): where starts, ingests and stale sources are said
   */
  constructor(
    private readonly configs: FeedSourceConfig[],
    private readonly ingest: IngestFn,
    private readonly logger: Pick<AddonHost['logger'], 'info' | 'warn'>,
    opts: FeedSchedulerOptions = {}
  ) {
    this.now = opts.now ?? Date.now;
    this.notify = opts.notify ?? (() => { /* no-op */ });
    this.defaultIntervalMinutes = opts.defaultIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
    this.maxConcurrent = opts.maxConcurrent ?? FEED_SETTING_DEFAULTS.maxConcurrentIngests;
  }

  /** How many sources it schedules. */
  get size(): number {
    return this.configs.length;
  }

  /**
   * One scheduler pass, as the job `ctx` names: warn on staleness, then start
   * every due source. They run side by side, up to `maxConcurrent`; the rest
   * queue for a free slot. Returns at once with what it started; `done`
   * resolves when those fetches have all finished. The job does not wait for
   * `done`, so one source hanging to its timeout never holds back the next
   * pass's other sources (#1955).
   */
  pass(ctx: JobContext): SchedulerPass {
    const now = this.now();
    const started: string[] = [];
    const runs: Promise<void>[] = [];
    for (const cfg of this.configs) {
      const st = this.stateOf(cfg.sourceId);
      this.checkStale(cfg, st, now);
      if (this.isDue(cfg, st, now)) {
        started.push(cfg.sourceId);
        runs.push(this.runOnce(cfg, st, now, ctx));
      }
    }
    return { started, done: Promise.all(runs).then(() => undefined) };
  }

  /** One pass, resolving when its fetches have all finished. */
  tick(ctx: JobContext): Promise<void> {
    return this.pass(ctx).done;
  }

  /** Wait for a free slot. A released slot passes straight to the next in line. */
  private acquireSlot(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }

  private stateOf(sourceId: string): SourceState {
    let st = this.state.get(sourceId);
    if (!st) {
      st = { lastAttemptAt: null, lastSuccessAt: null, failures: 0, running: false, staleWarned: false };
      this.state.set(sourceId, st);
    }
    return st;
  }

  private baseIntervalMs(cfg: FeedSourceConfig): number {
    return (cfg.intervalMinutes ?? this.defaultIntervalMinutes) * MINUTE_MS;
  }

  /** Effective interval grows with consecutive failures, capped. */
  private effectiveIntervalMs(cfg: FeedSourceConfig, st: SourceState): number {
    const mult = Math.min(2 ** st.failures, MAX_BACKOFF_MULTIPLIER);
    return this.baseIntervalMs(cfg) * mult;
  }

  isDue(cfg: FeedSourceConfig, st: SourceState, now: number): boolean {
    if (st.running) return false;
    if (cfg.dailyAt) return this.isDailyDue(cfg.dailyAt, st, now);
    if (st.lastAttemptAt === null) return true; // never attempted → due
    return now - st.lastAttemptAt >= this.effectiveIntervalMs(cfg, st);
  }

  /** Daily cadence: due once per local day, after the configured 'HH:MM'. */
  private isDailyDue(dailyAt: string, st: SourceState, now: number): boolean {
    const m = /^(\d{1,2}):(\d{2})$/.exec(dailyAt.trim());
    if (!m) return false;
    const d = new Date(now);
    const targetMin = Number(m[1]) * 60 + Number(m[2]);
    const nowMin = d.getHours() * 60 + d.getMinutes();
    if (nowMin < targetMin) return false;
    if (st.lastAttemptAt !== null) {
      const last = new Date(st.lastAttemptAt);
      if (last.getFullYear() === d.getFullYear() && last.getMonth() === d.getMonth() && last.getDate() === d.getDate()) {
        return false; // already attempted today
      }
    }
    return true;
  }

  private async runOnce(cfg: FeedSourceConfig, st: SourceState, now: number, ctx: JobContext): Promise<void> {
    // Marked before the slot wait, so a later tick never queues it a second time.
    st.running = true;
    st.lastAttemptAt = now;
    await this.acquireSlot();
    try {
      // P1: the job's context, with this fetch's own reason for the record.
      const res = await this.ingest(cfg.sourceId, { ...ctx, reason: `fetch feed '${cfg.sourceId}' on its schedule (#2109)` });
      st.lastSuccessAt = now;
      st.failures = 0;
      st.staleWarned = false;
      this.logger.info(`[feeds] ${cfg.sourceId}: ingested (added=${res.added} updated=${res.updated} unchanged=${res.unchanged} removed=${res.removed})`);
    } catch (err) {
      st.failures++;
      this.logger.warn(`[feeds] ${cfg.sourceId}: ingest failed (${st.failures} consecutive): ${String(err)}`);
    } finally {
      st.running = false;
      this.releaseSlot();
    }
  }

  /** Emit a single WARN when a source goes stale; reset when it recovers. */
  private checkStale(cfg: FeedSourceConfig, st: SourceState, now: number): void {
    const stalenessMs = this.baseIntervalMs(cfg) * STALENESS_MULTIPLIER;
    const stale = st.lastSuccessAt === null
      ? st.failures >= FAILURES_BEFORE_NEVER_SUCCEEDED_STALE
      : now - st.lastSuccessAt > stalenessMs;

    if (stale && !st.staleWarned) {
      st.staleWarned = true;
      const detail = st.lastSuccessAt === null
        ? `has never fetched successfully (${st.failures} consecutive failures)`
        : `last succeeded ${Math.round((now - st.lastSuccessAt) / MINUTE_MS)} min ago`;
      this.logger.warn(`[feeds] stale source '${cfg.sourceId}' — ${detail}`);
      this.notify({
        level: 'warning',
        title: 'Stale data feed',
        message: `Feed source '${cfg.sourceId}' ${detail}. Records may be out of date; check the upstream endpoint (${cfg.url}).`
      });
    }
  }
}
