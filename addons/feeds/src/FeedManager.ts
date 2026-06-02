/**
 * FeedManager — the feeds addon's runtime (#685).
 *
 * Holds one { config, store, catalogSource } per configured feed, registers each
 * FeedCatalogSource with CatalogManager, and runs the ingest pipeline
 * (adapter.fetch → adapter.parse → RecordStore.upsertAll with DeltaStorage
 * change-detection). Registered with the engine as 'FeedManager' so the
 * `fetch='FeedManager.latest(...)'` consumer convention can reach it (slice 5).
 *
 * No scheduler yet — ingest() is triggered manually/by tests; the cron tick
 * (BackupManager pattern) lands in slice 6.
 */

import { FeedCatalogSource } from './FeedCatalogSource.js';
import { RecordStore } from './RecordStore.js';
import { recordToCreativeWork } from './normalize.js';
import { getAdapter } from './adapters/index.js';
import { FeedScheduler } from './FeedScheduler.js';
import type { FeedSchedulerOptions } from './FeedScheduler.js';
import type { SourceAdapter } from './adapters/types.js';
import type { FeedSourceConfig } from './types.js';
import type { UpsertResult } from './RecordStore.js';

interface CatalogRegistrar {
  registerSource(source: FeedCatalogSource): void;
}

interface FeedEntry {
  config: FeedSourceConfig;
  store: RecordStore;
  source: FeedCatalogSource;
}

/** Resolve an adapter by name — injectable so tests can supply a stub. */
export type AdapterResolver = (name: string) => SourceAdapter | null;

export class FeedManager {
  private readonly feeds: Map<string, FeedEntry> = new Map();
  private scheduler: FeedScheduler | null = null;

  constructor(
    sourceConfigs: FeedSourceConfig[],
    baseDir: string,
    private readonly resolveAdapter: AdapterResolver = getAdapter
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
  async getRecords(sourceId: string): Promise<import('./adapters/types.js').NormalizedRecord[]> {
    const entry = this.feeds.get(sourceId);
    return entry ? entry.store.list() : [];
  }

  /** Start the poll scheduler (#685 slice 6). No-op when no sources configured. */
  startScheduler(opts: FeedSchedulerOptions = {}): void {
    this.stopScheduler();
    const configs = [...this.feeds.values()].map(e => e.config);
    this.scheduler = new FeedScheduler(configs, id => this.ingest(id), opts);
    this.scheduler.start();
  }

  /** Stop the poll scheduler (addon shutdown). */
  stopScheduler(): void {
    this.scheduler?.stop();
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
   * Run one ingest pass for a source: fetch → parse → change-detect + persist.
   * Throws on unknown source or unknown adapter; lets transport errors surface.
   */
  async ingest(sourceId: string): Promise<UpsertResult> {
    const entry = this.feeds.get(sourceId);
    if (!entry) throw new Error(`feeds: unknown source '${sourceId}'`);

    const adapter = this.resolveAdapter(entry.config.adapter);
    if (!adapter) throw new Error(`feeds: unknown adapter '${entry.config.adapter}' for source '${sourceId}'`);

    const raw = await adapter.fetch(entry.config);
    const normalized = raw
      .map(r => adapter.parse(r, entry.config))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return entry.store.upsertAll(normalized);
  }
}
