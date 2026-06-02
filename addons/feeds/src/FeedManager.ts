/**
 * FeedManager — the feeds addon's runtime (#685).
 *
 * Holds one FeedCatalogSource per configured source and registers each with
 * CatalogManager. SKELETON (slice 3): no scheduler, no adapters, no store yet —
 * those land in slices 4–6. Registered with the engine as 'FeedManager' so the
 * `fetch='FeedManager.latest(...)'` consumer convention can reach it (slice 5).
 */

import { FeedCatalogSource } from './FeedCatalogSource.js';
import type { FeedSourceConfig } from './types.js';

/** Minimal structural view of CatalogManager — only what FeedManager calls. */
interface CatalogRegistrar {
  registerSource(source: FeedCatalogSource): void;
}

export class FeedManager {
  private readonly sources: Map<string, FeedCatalogSource> = new Map();

  constructor(sourceConfigs: FeedSourceConfig[]) {
    for (const cfg of sourceConfigs) {
      this.sources.set(cfg.sourceId, new FeedCatalogSource(cfg));
    }
  }

  /** Register every configured feed as a CatalogSource. Returns the count registered. */
  registerSources(catalogManager: CatalogRegistrar): number {
    for (const src of this.sources.values()) {
      catalogManager.registerSource(src);
    }
    return this.sources.size;
  }

  /** Configured source ids. */
  getSourceIds(): string[] {
    return [...this.sources.keys()];
  }
}
