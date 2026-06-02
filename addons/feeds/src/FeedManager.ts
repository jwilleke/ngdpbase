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
import { getAdapter } from './adapters/index.js';
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
