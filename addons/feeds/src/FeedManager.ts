import type { ActorContext } from '../../../dist/src/context/ActorContext.js';
import type { JobContext } from '../../../dist/src/context/JobContext.js';
import type { JobRunContext } from '../../../dist/src/managers/BackgroundJobManager.js';
import type { FileDoneInfo, IceItem, IceReceiver, IceRecordData, IceRunReport, IceRunRequest, ReceiveOutcome } from '../../../dist/src/ice/types.js';
import type { AddonHost } from '../../../dist/src/utils/addonHost.js';
/**
 * FeedManager — the feeds addon's runtime (#685), on the import engine since
 * #2109 (D10: "a feed is a scheduled URL source, plus shims, into FeedManager").
 *
 * - It holds the feed settings: one { config, store, catalogSource } per
 *   configured feed, each FeedCatalogSource registered with CatalogManager.
 * - It shows them: records for `[DataFeed]`, `toMarqueeText()` for the
 *   `fetch='FeedManager.toMarqueeText(...)'` convention (only toMarqueeText
 *   may be fetched, #1556).
 * - It is the receiver for feed items (`feeds.items`): the engine hands it
 *   each source's records, and it keeps them in that source's RecordStore.
 * - It asks the engine to fetch each source when it is due: a URL source,
 *   parsed by the core record shim the source's `adapter` names (`core.<adapter>`),
 *   with the source's headers and timeout (#1959). The engine owns the
 *   fetch (guarded, #1139), the shims, and per-item duplicate handling.
 * - Its schedule is the background job `feeds.poll`, not a timer.
 */

import { FeedCatalogSource } from './FeedCatalogSource.js';
import { RecordStore } from './RecordStore.js';
import { shapeRecords } from './dedupe.js';
import { recordToCreativeWork } from './normalize.js';
import { recordHash } from './recordHash.js';
import { FeedScheduler } from './FeedScheduler.js';
import type { FeedSchedulerOptions } from './FeedScheduler.js';
import type { FeedSourceConfig, NormalizedRecord } from './types.js';
import type { UpsertResult } from './RecordStore.js';

interface CatalogRegistrar {
  registerSource(source: FeedCatalogSource): void;
}

interface FeedEntry {
  config: FeedSourceConfig;
  store: RecordStore;
  source: FeedCatalogSource;
}

/** The import engine, as FeedManager uses it: one run, now, off the request path (it runs inside a job). */
export interface FeedImporter {
  runImport(request: IceRunRequest, ctx: ActorContext): Promise<IceRunReport>;
}

/** A permission asked of the PDP with a context (P2): how the receiver checks its existing permission. */
export type FeedPermits = (ctx: ActorContext, permission: string) => Promise<boolean>;

/** Where the poll job is registered: BackgroundJobManager's routine door (#1721). */
export interface FeedJobs {
  registerMaintenance(spec: { id: string; displayName: string; everyMs: number; run: (ctx: JobRunContext) => Promise<string | void> }): void;
}

/** Core's generic record kind (#2109): what the record shims produce, `data: { id, properties }`. */
const RECORD_KIND = 'record';

/**
 * The core record shim a source's `adapter` names (#2109): `csv` → `core.csv`.
 * The shims are core's, so any add-on can use them; a site switches one off
 * with `ngdpbase.import.shims.core.<adapter>.enabled`.
 */
export function shimIdFor(adapter: string): string {
  return `core.${adapter}`;
}

/** The receiver's name; its id is `feeds.items`. */
export const FEED_RECEIVER_NAME = 'items';
const FEED_RECEIVER_ID = `feeds.${FEED_RECEIVER_NAME}`;

/** The poll job (#2109): every minute by default, `ngdpbase.jobs.feeds.poll.schedule` to change it. */
export const FEED_POLL_JOB = 'feeds.poll';
const FEED_POLL_EVERY_MS = 60_000;

/**
 * The permission the receiver checks (D5, no new permission). Feed sources
 * are site configuration, so what a feed holds is changed by whoever may
 * change configuration: the site's scheduled job (acting as the system
 * principal, or as `job:feeds.poll` when a policy names it, #1999), or an
 * administrator running the job by hand.
 */
export const FEED_PERMISSION = 'config-manage';

/** The `metadata` key a run's source names its feed by. */
const FEED_SOURCE_KEY = 'feedSource';

/** A `record` item's data, or null for anything else. */
function recordOf(item: IceItem): IceRecordData | null {
  if (item.kind !== RECORD_KIND) return null;
  const data = item.data as Partial<IceRecordData> | undefined;
  if (!data || typeof data.id !== 'string' || !data.id || !data.properties || typeof data.properties !== 'object') return null;
  return { id: data.id, properties: data.properties };
}

/** The parse settings a source hands its shim (#2109): only the ones it sets. */
function shimOptionsOf(cfg: FeedSourceConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['recordIdField', 'map', 'itemsPath', 'delimiter', 'skipLines', 'linkPattern', 'maxItems'] as const) {
    if (cfg[key] !== undefined) out[key] = cfg[key];
  }
  return out;
}

export class FeedManager {
  private readonly feeds: Map<string, FeedEntry> = new Map();
  private scheduler: FeedScheduler | null = null;
  /** What each run's settled file stored, by run id: read back by `ingest` once the run returns. */
  private readonly settled = new Map<string, UpsertResult>();
  /** The receiver's permission, asked once per run (D5): a feed holds thousands of items. */
  private readonly runAllowed = new Map<string, Promise<boolean>>();

  /**
   * @param host      What core handed the feeds add-on (#1813): its logger.
   * @param importer  The import engine (ImportManager): every fetch and parse goes through it.
   * @param permits   The PDP's `permits`, for the receiver's existing permission (D5, P2).
   */
  constructor(
    private readonly host: Pick<AddonHost, 'logger'>,
    sourceConfigs: FeedSourceConfig[],
    baseDir: string,
    private readonly importer: FeedImporter,
    private readonly permits: FeedPermits
  ) {
    for (const config of sourceConfigs) {
      const store = new RecordStore(baseDir, config.sourceId);
      this.feeds.set(config.sourceId, { config, store, source: new FeedCatalogSource(config, store) });
    }
  }

  /** Register every configured feed as a CatalogSource. Returns the count. */
  registerSources(catalogManager: CatalogRegistrar): number {
    for (const { source } of this.feeds.values()) catalogManager.registerSource(source);
    return this.feeds.size;
  }

  /** Configured source ids. */
  getSourceIds(): string[] {
    return [...this.feeds.keys()];
  }

  /** Full normalized records for a source (with `properties`) — for the `[DataFeed]` plugin. */
  async getRecords(sourceId: string): Promise<NormalizedRecord[]> {
    const entry = this.feeds.get(sourceId);
    return entry ? entry.store.list() : [];
  }

  /**
   * Schedule the feeds (#685 slice 6) as the routine background job
   * `feeds.poll` (#2109): each run looks for the sources that are due and
   * starts their fetches, each under the job's context. No-op when no
   * sources are configured.
   */
  startScheduler(jobs: FeedJobs, opts: FeedSchedulerOptions = {}): void {
    this.stopScheduler();
    const configs = [...this.feeds.values()].map(e => e.config);
    if (configs.length === 0) return;
    this.scheduler = new FeedScheduler(configs, (id, ctx) => this.ingest(id, ctx), this.host.logger, opts);
    jobs.registerMaintenance({
      id: FEED_POLL_JOB,
      displayName: 'Feeds: fetch the sources that are due',
      everyMs: FEED_POLL_EVERY_MS,
      run: async (ctx) => {
        const scheduler = this.scheduler;
        if (!scheduler) return 'feeds stopped';
        const { started } = scheduler.pass(ctx);
        return started.length > 0 ? `started ${started.join(', ')}` : undefined;
      }
    });
    this.host.logger.info(`[feeds] scheduled ${configs.length} source(s) as the job ${FEED_POLL_JOB}`);
  }

  /** Stop scheduling (addon shutdown): the job's later runs do nothing. */
  stopScheduler(): void {
    this.scheduler = null;
  }

  /**
   * Marquee text for a source — the `BaseManager.toMarqueeText()` convention, so
   * `[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]`
   * renders the latest records with no feed-specific plugin (#685 slice 5).
   * Args arrive as a `{k: v}` string bag (from `resolveManagerFetch`).
   *
   * `source` (required) — the feed sourceId. `max` (default 5) — record count.
   * `sep` (default '   •   ') — joiner. Returns '' for an unknown/empty source
   * (MarqueePlugin then shows its own "no text" placeholder).
   */
  async toMarqueeText(opts: Record<string, string> = {}): Promise<string> {
    const entry = opts.source ? this.feeds.get(opts.source) : undefined;
    if (!entry) return '';

    const max = Math.max(1, parseInt(opts.max ?? '', 10) || 5);
    const sep = opts.sep ?? '   •   ';

    const records = await entry.store.list();
    const works = records.map(r => recordToCreativeWork(r, entry.config));
    // Latest first: ISO dateCreated sorts lexically; undated records sort last.
    works.sort((a, b) => (b.dateCreated ?? '').localeCompare(a.dateCreated ?? ''));
    return works.slice(0, max).map(w => w.name).join(sep);
  }

  /**
   * Fetch one source now, through the engine, as `ctx` (P1): the job's
   * context with its reason. The engine fetches the source's URL, its shim
   * reads it, and this manager's receiver stores the result. Resolves with
   * what the store changed; throws when nothing was stored (an unknown
   * source, a failed fetch, a shim that could not read it, a refusal).
   */
  async ingest(sourceId: string, ctx: JobContext): Promise<UpsertResult> {
    const entry = this.feeds.get(sourceId);
    if (!entry) throw new Error(`feeds: unknown source '${sourceId}'`);
    const { config } = entry;

    const report = await this.importer.runImport({
      source: {
        type: 'url',
        url: config.url,
        ...(config.headers ? { headers: config.headers } : {}),
        ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
        metadata: { [FEED_SOURCE_KEY]: sourceId }
      },
      receiver: FEED_RECEIVER_ID,
      shim: shimIdFor(config.adapter),
      // The source's own item keys, within the run's user's scope (#2013).
      scope: sourceId,
      original: 'none',
      options: shimOptionsOf(config)
    }, ctx);

    const result = this.settled.get(report.runId);
    this.settled.delete(report.runId);
    this.runAllowed.delete(report.runId);
    const file = report.files[0];
    for (const w of file?.warnings ?? []) this.host.logger.warn(`[feeds] ${sourceId}: ${w.detail}`);
    if (file?.status === 'partial' && file.message) this.host.logger.warn(`[feeds] ${sourceId}: ${file.message}`);
    if (!result) {
      throw new Error(`feeds: ${sourceId}: ${report.error ?? file?.message ?? `nothing was read (${file?.status ?? 'no file'})`}`);
    }
    return result;
  }

  /**
   * `feeds.items` (D4): FeedManager's own door for the records core's
   * record shims produce. It checks its existing permission (D5,
   * {@link FEED_PERMISSION}); it takes no uploads, since what a feed holds
   * comes only from its source.
   *
   * A feed's store is a snapshot of its source: `receive` says whether each
   * record handed to it is new or changed (the receiver's own duplicate
   * check, by the record's content hash, so the stores written before #2109
   * carry over unchanged), and `fileDone` stores the whole source at once —
   * the records the engine skipped as already seen included — shaped by the
   * source's `dedupeBy` / `maxAgeHours`, dropping what the source no longer
   * holds, exactly as an ingest always has.
   */
  receiver(): IceReceiver {
    return {
      name: FEED_RECEIVER_NAME,
      label: 'Feed items',
      accepts: [RECORD_KIND],
      uploads: false,
      originals: { allowed: ['none'] },
      mayUse: (ctx) => this.permits(ctx, FEED_PERMISSION),
      receive: async (item, ctx, info): Promise<ReceiveOutcome> => {
        const entry = this.entryFor(item.metadata);
        if (!entry) return { status: 'refused', message: 'Feed items come only from a configured feed source' };
        if (!await this.allowedFor(info.runId, ctx)) return { status: 'refused', message: 'You may not change what a feed holds' };
        const rec = recordOf(item);
        if (!rec) return { status: 'refused', message: 'not a feed record' };
        const held = await entry.store.hashOf(rec.id);
        return held === recordHash({ sourceRecordId: rec.id, properties: rec.properties }) ? { status: 'duplicate' } : { status: 'stored' };
      },
      fileDone: async (ctx, info) => this.settle(ctx, info)
    };
  }

  /** The configured feed a run's source names. */
  private entryFor(metadata: Record<string, unknown> | undefined): FeedEntry | undefined {
    const id = metadata?.[FEED_SOURCE_KEY];
    return typeof id === 'string' ? this.feeds.get(id) : undefined;
  }

  private allowedFor(runId: string, ctx: ActorContext): Promise<boolean> {
    let allowed = this.runAllowed.get(runId);
    if (!allowed) {
      allowed = this.permits(ctx, FEED_PERMISSION).catch(() => false);
      this.runAllowed.set(runId, allowed);
    }
    return allowed;
  }

  /** Store a source's whole snapshot (see {@link receiver}). */
  private async settle(ctx: ActorContext, info: FileDoneInfo): Promise<string> {
    const entry = this.entryFor(info.metadata);
    if (!entry) throw new Error('feed items come only from a configured feed source');
    if (!await this.allowedFor(info.runId, ctx)) throw new Error('you may not change what a feed holds');
    const sourceId = entry.config.sourceId;
    const fetchedAt = new Date().toISOString();
    const normalized: NormalizedRecord[] = [];
    for (const item of info.items) {
      const rec = recordOf(item);
      if (rec) normalized.push({ sourceRecordId: rec.id, fetchedAt, properties: rec.properties });
    }

    // Per-source shaping — keep-latest-per-group / max-age (#989). A no-op
    // unless the source configures it.
    const shaped = shapeRecords(normalized, entry.config);
    if (shaped.droppedDuplicates || shaped.droppedStale) {
      this.host.logger.debug(
        `[feeds] ${sourceId}: shaped ${normalized.length} → ${shaped.records.length} records ` +
        `(${shaped.droppedDuplicates} older-in-group, ${shaped.droppedStale} stale)`
      );
    }
    // upsertAll REPLACES the store, so shaping everything away empties the
    // source. Legitimate for a genuinely stale feed, but indistinguishable from
    // a misconfigured dedupeBy/maxAgeHours — say so rather than silently wiping.
    if (normalized.length > 0 && shaped.records.length === 0) {
      this.host.logger.warn(
        `[feeds] ${sourceId}: shaping discarded all ${normalized.length} records — ` +
        'the store will be emptied. Check dedupeBy/maxAgeHours for this source.'
      );
    }

    const result = await entry.store.upsertAll(shaped.records);
    this.settled.set(info.runId, result);
    return `${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged, ${result.removed} removed`;
  }
}
