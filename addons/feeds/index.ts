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

import path from 'path';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type CatalogManager from '../../dist/src/managers/CatalogManager.js';
import type ConfigurationManager from '../../dist/src/managers/ConfigurationManager.js';
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

    // Record store lives under FAST_STORAGE (operational data); override via dataPath.
    const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
    const baseDir = typeof config.dataPath === 'string' && config.dataPath !== ''
      ? config.dataPath
      : path.join(configManager?.getInstanceDataFolder?.() ?? './data', 'feeds');

    feedManager = new FeedManager(sourceConfigs, baseDir);

    // Reachable for the fetch='FeedManager.toMarqueeText(...)' consumer convention (slice 5).
    engine.registerManager('FeedManager', feedManager);

    const catalogManager = engine.getManager<CatalogManager>('CatalogManager');
    if (catalogManager) {
      const n = feedManager.registerSources(catalogManager);
      logger.info(`[feeds addon] Registered ${n} feed source(s) with CatalogManager`);
    } else {
      logger.warn('[feeds addon] CatalogManager not available — feed sources not registered');
    }

    // Start the poll scheduler; stale-feed warnings route to /admin/notifications.
    const nm = engine.getManager('NotificationManager') as
      | { addNotification?: (n: unknown) => Promise<string> }
      | null;
    const notify = (n: { level: string; title: string; message: string }): void => {
      if (nm?.addNotification) nm.addNotification({ type: 'system', ...n }).catch(() => { /* ignore */ });
    };
    feedManager.startScheduler({ notify });
  },

  status(): Promise<AddonStatusDetails> {
    const n = feedManager?.getSourceIds().length ?? 0;
    return Promise.resolve({
      healthy: true,
      message: `${n} feed source(s) configured (geojson adapter; auto-poll scheduler active)`
    });
  },

  shutdown(): Promise<void> {
    feedManager?.stopScheduler();
    feedManager = null;
    return Promise.resolve();
  }
};

export default feedsAddon;
