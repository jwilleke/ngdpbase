/**
 * FeedScheduler (#685 slice 6) — polls each configured feed on a cadence,
 * mirroring the engine's BackupManager pattern: a single `setInterval` tick
 * (default 60s, `.unref()`'d so it never blocks process exit) that checks which
 * sources are due and runs `ingest()` for them.
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

import logger from '../../../dist/src/utils/logger.js';
import type { FeedSourceConfig } from './types.js';
import type { UpsertResult } from './RecordStore.js';
import { FEED_SETTING_DEFAULTS } from './config.js';

const MINUTE_MS = 60_000;
const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_TICK_MS = 60_000;
const MAX_BACKOFF_MULTIPLIER = 6; // cap effective interval at 6× base
const STALENESS_MULTIPLIER = 3;   // warn after 3× the base interval with no success
const FAILURES_BEFORE_NEVER_SUCCEEDED_STALE = 3;

export interface SchedulerNotification { level: string; title: string; message: string }
export type SchedulerNotify = (n: SchedulerNotification) => void;
export type IngestFn = (sourceId: string) => Promise<UpsertResult>;

export interface FeedSchedulerOptions {
  now?: () => number;
  notify?: SchedulerNotify;
  tickMs?: number;
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
  private readonly tickMs: number;
  private readonly defaultIntervalMinutes: number;
  private readonly maxConcurrent: number;
  /** Ingests holding a slot now, and the queued ones waiting for a slot. */
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly state = new Map<string, SourceState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configs: FeedSourceConfig[],
    private readonly ingest: IngestFn,
    opts: FeedSchedulerOptions = {}
  ) {
    this.now = opts.now ?? Date.now;
    this.notify = opts.notify ?? (() => { /* no-op */ });
    this.tickMs = opts.tickMs ?? DEFAULT_TICK_MS;
    this.defaultIntervalMinutes = opts.defaultIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
    this.maxConcurrent = opts.maxConcurrent ?? FEED_SETTING_DEFAULTS.maxConcurrentIngests;
  }

  start(): void {
    this.stop();
    if (this.configs.length === 0) return;
    const timer = setInterval(() => void this.tick(), this.tickMs);
    timer.unref?.(); // don't block process exit (BackupManager pattern)
    this.timer = timer;
    logger.info(`[feeds] scheduler started — ${this.configs.length} source(s), tick ${this.tickMs}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One scheduler pass: warn on staleness, then start every due source. They
   * run side by side, up to `maxConcurrent`; the rest queue for a free slot.
   * Resolves when this pass's ingests have all finished.
   */
  async tick(): Promise<void> {
    const now = this.now();
    const runs: Promise<void>[] = [];
    for (const cfg of this.configs) {
      const st = this.stateOf(cfg.sourceId);
      this.checkStale(cfg, st, now);
      if (this.isDue(cfg, st, now)) runs.push(this.runOnce(cfg, st, now));
    }
    await Promise.all(runs);
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

  private async runOnce(cfg: FeedSourceConfig, st: SourceState, now: number): Promise<void> {
    // Marked before the slot wait, so a later tick never queues it a second time.
    st.running = true;
    st.lastAttemptAt = now;
    await this.acquireSlot();
    try {
      const res = await this.ingest(cfg.sourceId);
      st.lastSuccessAt = now;
      st.failures = 0;
      st.staleWarned = false;
      logger.info(`[feeds] ${cfg.sourceId}: ingested (added=${res.added} updated=${res.updated} unchanged=${res.unchanged} removed=${res.removed})`);
    } catch (err) {
      st.failures++;
      logger.warn(`[feeds] ${cfg.sourceId}: ingest failed (${st.failures} consecutive): ${String(err)}`);
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
      logger.warn(`[feeds] stale source '${cfg.sourceId}' — ${detail}`);
      this.notify({
        level: 'warning',
        title: 'Stale data feed',
        message: `Feed source '${cfg.sourceId}' ${detail}. Records may be out of date; check the upstream endpoint (${cfg.url}).`
      });
    }
  }
}
