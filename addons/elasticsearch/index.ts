
/**
 * Elasticsearch External Asset Add-on for ngdpbase
 *
 * Registers a read-only Sist2AssetProvider with the AssetManager so that
 * an Elasticsearch-indexed asset source (NAS via sist2, S3, or any compatible
 * crawler) is browsable and searchable from the asset picker.
 *
 * Configuration keys (in app-custom-config.json):
 *   ngdpbase.addons.elasticsearch.enabled    — true/false (default: false)
 *   ngdpbase.addons.elasticsearch.es-url     — Elasticsearch base URL
 *                                              (default: "http://localhost:9200")
 *   ngdpbase.addons.elasticsearch.es-index   — Elasticsearch index name
 *                                              (default: "sist2")
 *   ngdpbase.addons.elasticsearch.sist2-url  — sist2 search UI base URL for
 *                                              file/thumbnail serving
 *                                              (default: "http://localhost:4090")
 *   ngdpbase.addons.elasticsearch.index-ids  — Array of sist2 scan index IDs to
 *                                              filter on. Empty array = all indices.
 *                                              (default: [])
 *   ngdpbase.addons.elasticsearch.hidden-paths — Array of path prefix patterns to
 *                                              exclude from results by default (backup dirs,
 *                                              snapshots, etc.). Users can opt-in via
 *                                              includeHidden query param.
 *                                              (default: [])
 *
 * Provider capabilities: search, thumbnail (proxied through ngdpbase).
 * Tags: sist2 `tag` field maps to AssetRecord.keywords (read-only).
 */

import path from 'path';
import { Client } from '@elastic/elasticsearch';
import type { WikiEngine } from '../../dist/src/types/WikiEngine.js';
import type AddonsManager from '../../dist/src/managers/AddonsManager.js';
import type { AddonStatusDetails } from '../../dist/src/managers/AddonsManager.js';
import type AssetManager from '../../dist/src/managers/AssetManager.js';
import { Sist2AssetProvider } from './src/Sist2AssetProvider.js';
import logger from '../../dist/src/utils/logger.js';
import adminRoutes from './routes/admin.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let provider: Sist2AssetProvider | null = null;
let storedConfig: { esUrl: string; esIndex: string; sist2Url: string; indexIds: number[]; hiddenPaths: string[] | null } | null = null;

const elasticsearchAddon = {
  name: 'elasticsearch',
  version: '1.0.0',
  description: 'Elasticsearch external asset provider (sist2/S3/NAS)',
  author: 'Jim Willeke',
  dependencies: [] as string[],

  /**
   * Called at startup when the add-on is enabled.
   */
   
  async register(engine: WikiEngine, config: Record<string, unknown>): Promise<void> {
    const esUrl    = typeof config['es-url']    === 'string' ? config['es-url']    : 'http://localhost:9200';
    const esIndex  = typeof config['es-index']  === 'string' ? config['es-index']  : 'sist2';
    const sist2Url = typeof config['sist2-url'] === 'string' ? config['sist2-url'] : 'http://localhost:4090';
    const rawIds   = Array.isArray(config['index-ids']) ? config['index-ids'] : [];
    const indexIds = rawIds.map(Number).filter((n) => !isNaN(n));

    // path-access: principal (role name or username) → string[] of allowed path prefixes.
    // An absent key or absent config means no filtering.
    // An empty array for a principal means unrestricted access.
    let pathAccess: Record<string, string[]> | null = null;
    const rawPathAccess = config['path-access'];
    if (rawPathAccess !== null && rawPathAccess !== undefined && typeof rawPathAccess === 'object' && !Array.isArray(rawPathAccess)) {
      const validated: Record<string, string[]> = {};
      for (const [role, paths] of Object.entries(rawPathAccess as Record<string, unknown>)) {
        if (Array.isArray(paths) && paths.every((p) => typeof p === 'string')) {
          validated[role] = paths;
        }
      }
      pathAccess = validated;
    }

    const rawHiddenPaths = config['hidden-paths'];
    const hiddenPaths: string[] | null = Array.isArray(rawHiddenPaths) && rawHiddenPaths.every((p) => typeof p === 'string')
      ? rawHiddenPaths
      : null;

    const client = new Client({ node: esUrl });
    provider = new Sist2AssetProvider(client, esIndex, sist2Url, indexIds, pathAccess, hiddenPaths);
    storedConfig = { esUrl, esIndex, sist2Url, indexIds, hiddenPaths };

    const assetManager = engine.getManager<AssetManager>('AssetManager');
    if (assetManager) {
      assetManager.registerProvider(provider);
    } else {
      // AssetManager may not be initialised yet — defer registration
      // by listening for the manager-ready event if the engine supports it.
      // For now, log a warning; the provider will be unavailable.
      logger.warn('[elasticsearch addon] AssetManager not available — sist2 provider not registered');
    }

    // ── Register addon-local views directory ──────────────────────────────────
    const existing = (engine.app?.get('views') as string | string[]) ?? [];
    engine.app?.set('views', [...[existing].flat(), path.join(__dirname, 'views')]);

    // ── Mount admin route ─────────────────────────────────────────────────────
    engine.app?.use('/addons/elasticsearch', adminRoutes(engine, () => provider, storedConfig));

    const addonsManager = engine.getManager<AddonsManager>('AddonsManager');
    if (addonsManager) {
      addonsManager.registerDashboardCard({
        addonName: 'elasticsearch',
        title: 'Elasticsearch',
        icon: 'fas fa-search',
        adminUrl: '/addons/elasticsearch'
      });
    }

    engine.setCapability('sist2', true);
  },

  /** Health check — shown in /admin add-ons panel. */
  async status(): Promise<AddonStatusDetails> {
    if (!provider) {
      return { healthy: false, message: 'Provider not initialised' };
    }
    // #998: report WHICH dependency failed. The old message blamed
    // es-url/sist2-url for every failure, including a missing index — which was
    // the actual fault on jimstest and is not fixed by either of those keys.
    return provider.healthCheckDetailed();
  },

  /** Cleanup on graceful shutdown. */
   
  async shutdown(): Promise<void> {
    provider = null;
    storedConfig = null;
  }
};

export default elasticsearchAddon;
