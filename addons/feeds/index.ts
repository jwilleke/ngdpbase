/**
 * Feeds add-on for ngdpbase — data-ingestion framework (#685).
 *
 * Pulls structured data from external feeds on a schedule, normalizes each
 * record to a schema.org CreativeWork, and exposes it as a CatalogSource
 * consumed by plugins — without writing one page per record. See the design
 * gate at docs/platform/feeds/design.md.
 *
 * SKELETON (slice 3): registers a FeedCatalogSource per configured source with
 * CatalogManager and registers FeedManager with the engine. No adapters, no
 * scheduler, no store yet (slices 4–6). The addon is inert until enabled
 * (`ngdpbase.addons.feeds.enabled: true`) and a source is configured.
 *
 * Configuration (app-custom-config.json, established `ngdpbase.addons.<name>.*`):
 *   ngdpbase.addons.feeds.enabled                  — true/false (default: false)
 *   ngdpbase.addons.feeds.sources.<id>.adapter     — 'geojson' | 'rest-json' | ...
 *   ngdpbase.addons.feeds.sources.<id>.url         — upstream feed URL
 *   ngdpbase.addons.feeds.sources.<id>.type        — schema.org @type
 *   ngdpbase.addons.feeds.sources.<id>.intervalMinutes | .dailyAt
 *   ngdpbase.addons.feeds.sources.<id>.recordIdField | .map  (optional)
 */

import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type CatalogManager from '../../dist/src/managers/CatalogManager.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import logger from '../../dist/src/utils/logger.js';
import { FeedManager } from './src/FeedManager.js';
import { parseSourceConfigs } from './src/config.js';

let feedManager: FeedManager | null = null;

const feedsAddon = {
  name: 'feeds',
  version: '0.1.0',
  description: 'Data-ingestion framework — external feeds as CatalogSources (#685)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  async register(engine: WikiEngine, config: Record<string, unknown>): Promise<void> {
    const sourceConfigs = parseSourceConfigs(config.sources);
    feedManager = new FeedManager(sourceConfigs);

    // Reachable for the fetch='FeedManager.latest(...)' consumer convention (slice 5).
    engine.registerManager('FeedManager', feedManager);

    const catalogManager = engine.getManager<CatalogManager>('CatalogManager');
    if (catalogManager) {
      const n = feedManager.registerSources(catalogManager as unknown as { registerSource(s: unknown): void });
      logger.info(`[feeds addon] Registered ${n} feed source(s) with CatalogManager (skeleton — no adapters yet)`);
    } else {
      logger.warn('[feeds addon] CatalogManager not available — feed sources not registered');
    }
  },

  status(): Promise<AddonStatusDetails> {
    const n = feedManager?.getSourceIds().length ?? 0;
    return Promise.resolve({
      healthy: true,
      message: `${n} feed source(s) configured — skeleton (#685 slice 3), no adapters/scheduler yet`
    });
  },

  shutdown(): Promise<void> {
    feedManager = null;
    return Promise.resolve();
  }
};

export default feedsAddon;
