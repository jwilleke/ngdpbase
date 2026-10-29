/**
 * Feeds add-on for ngdpbase — data-ingestion framework (#685).
 *
 * Pulls structured data from external feeds on a schedule, normalizes each
 * record to a schema.org CreativeWork, and exposes it as a CatalogSource
 * consumed by plugins — without writing one page per record. See the design
 * gate at docs/platform/feeds/design.md.
 *
 * Since #2109 (ICE, D10) a feed is "a scheduled URL source, plus shims, into
 * FeedManager": the format shims are core's (`core.csv`, `core.rss-atom`, …,
 * registered by ImportManager), and the add-on registers only FeedManager as
 * the receiver `feeds.items` (declared in package.json's manifest) and its
 * schedule as the background job `feeds.poll`. The engine fetches each due
 * source through the guarded outbound path, runs the core shim the source's
 * `adapter` names and hands the records to FeedManager. The
 * addon is inert until enabled (`ngdpbase.addons.feeds.enabled: true`) and a
 * source is configured.
 *
 * Configuration (app-custom-config.json, established `ngdpbase.addons.<name>.*`):
 *   ngdpbase.addons.feeds.enabled                  — true/false (default: false)
 *   ngdpbase.addons.feeds.sources.<id>.adapter     — the core shim (core.<adapter>): 'geojson' | 'rest-json' | 'xml' | 'csv' | 'rss-atom' | 'xml-index'
 *   ngdpbase.addons.feeds.sources.<id>.url         — upstream feed URL
 *   ngdpbase.addons.feeds.sources.<id>.type        — schema.org @type
 *   ngdpbase.addons.feeds.sources.<id>.intervalMinutes | .dailyAt
 *   ngdpbase.addons.feeds.sources.<id>.recordIdField | .map  (optional)
 *   ngdpbase.addons.feeds.sources.<id>.headers | .userAgent | .timeoutMs  (optional, #1947/#1955)
 *   ngdpbase.addons.feeds.max-concurrent-ingests | .timeout-min-ms | .timeout-max-ms
 *     — addon-wide, shipped in config/default-config.json
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type CatalogManager from '../../dist/src/managers/CatalogManager.js';
import type ConfigurationManager from '../../dist/src/managers/ConfigurationManager.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type { AddonHost } from '../../dist/src/utils/addonHost.js';
import type { ActorContext } from '../../dist/src/context/ActorContext.js';
import { FeedManager, type FeedImporter, type FeedJobs } from './src/FeedManager.js';
import { parseSourceConfigs, readFeedSettings } from './src/config.js';
import { createDataFeedPlugin } from './src/DataFeedPlugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let feedManager: FeedManager | null = null;

const feedsAddon = {
  name: 'feeds',
  version: '0.1.0',
  description: 'Data-ingestion framework — external feeds as CatalogSources (#685)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  async register(engine: WikiEngine, config: Record<string, unknown>, host: AddonHost): Promise<void> {
    const { logger } = host;
    const settings = readFeedSettings(config, logger);
    const sourceConfigs = parseSourceConfigs(config.sources, logger, settings);

    // Record store lives under FAST_STORAGE (operational data); override via dataPath.
    const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
    const baseDir = typeof config.dataPath === 'string' && config.dataPath !== ''
      ? config.dataPath
      : path.join(configManager?.getInstanceDataFolder?.() ?? './data', 'feeds');

    // #2109: every fetch and parse goes through the import engine, whose one
    // way out is guardedFetch with the site's egress policy (#1133, #1139).
    const importer = engine.getManager<FeedImporter>('ImportManager');
    if (!importer) {
      logger.error('[feeds addon] ImportManager not available — feeds cannot be fetched');
      return;
    }
    const pdp = engine.getManager('PolicyDecisionPoint') as
      | { permits?: (ctx: ActorContext, permission: string) => Promise<boolean> }
      | null;
    feedManager = new FeedManager(
      host,
      sourceConfigs,
      baseDir,
      importer,
      async (ctx, permission) => typeof pdp?.permits === 'function' ? pdp.permits(ctx, permission) : false
    );

    // FeedManager's receiver (D4), as the manifest declares it; the format shims are core's.
    host.registerReceiver(feedManager.receiver());
    logger.info('[feeds addon] Registered the receiver feeds.items');

    // #1876, #1985: the record stores under dataPath are backed up by BackupManager, and a
    // staged restore of them was put in place before register() ran.

    // Reachable for the fetch='FeedManager.toMarqueeText(...)' consumer convention (slice 5).
    engine.registerManager('FeedManager', feedManager);

    const catalogManager = engine.getManager<CatalogManager>('CatalogManager');
    if (catalogManager) {
      const n = feedManager.registerSources(catalogManager);
      logger.info(`[feeds addon] Registered ${n} feed source(s) with CatalogManager`);
    } else {
      logger.warn('[feeds addon] CatalogManager not available — feed sources not registered');
    }

    // Register the [DataFeed] consumer plugin (#685 slice 7).
    const pluginManager = engine.getManager('PluginManager') as
      | { registerPlugin?: (name: string, plugin: unknown) => Promise<void> | void }
      | null;
    if (pluginManager?.registerPlugin) {
      await pluginManager.registerPlugin('DataFeed', createDataFeedPlugin(logger));
    }

    // Vendored Leaflet for [{DataFeed format='map'}] (geohazardwatch#162) — matching
    // the calendar/journal/forms addon convention of serving each addon's own
    // public/ dir at /addons/<name>, so map rendering works for any consumer of
    // this addon with no per-consumer vendoring required.
    engine.app?.use('/addons/feeds', engine.serveStatic(path.join(__dirname, 'public')));

    // Schedule the feeds as a background job (#2109); stale-feed warnings route to /admin/notifications.
    const nm = engine.getManager('NotificationManager') as
      | { notifyAdmins?: (n: unknown) => Promise<string | null> }
      | null;
    const notify = (n: { level: string; title: string; message: string }): void => {
      if (nm?.notifyAdmins) nm.notifyAdmins(n).catch(() => { /* ignore */ });
    };
    const jobs = engine.getManager<FeedJobs>('BackgroundJobManager');
    if (typeof jobs?.registerMaintenance === 'function') {
      feedManager.startScheduler(jobs, { notify, maxConcurrent: settings.maxConcurrentIngests });
    } else {
      logger.error('[feeds addon] BackgroundJobManager not available — feeds are not scheduled');
    }
  },

  status(): Promise<AddonStatusDetails> {
    const n = feedManager?.getSourceIds().length ?? 0;
    return Promise.resolve({
      healthy: true,
      message: `${n} feed source(s) configured (fetched through the import engine; scheduled as the job feeds.poll)`
    });
  },

  shutdown(): Promise<void> {
    feedManager?.stopScheduler();
    feedManager = null;
    return Promise.resolve();
  }
};

export default feedsAddon;
