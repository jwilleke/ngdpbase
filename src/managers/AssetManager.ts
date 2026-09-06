/**
 * AssetManager — provider registry for the unified DAM framework.
 *
 * Holds a registry of AssetProviders (keyed by provider.id) and exposes a
 * single search/getById/getThumbnail API that fans out across all registered
 * providers.  The two built-in providers (BasicAttachmentProvider via
 * AttachmentManager, FileSystemMediaProvider via MediaManager) are registered
 * automatically in initialize().  Addons register additional providers via
 * registerProvider().
 *
 * AssetService delegates to this manager so its existing public API is
 * unchanged — callers that already use AssetService continue to work without
 * modification.
 */

import fs from 'fs-extra';
import path from 'path';
import BaseManager from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type { AssetProvider, AssetRecord, AssetPage, AssetQuery, AssetAggregations, AssetFacet, ProviderHealthStatus, ProviderHealthReport } from '../types/Asset.js';
import type ConfigurationManager from './ConfigurationManager.js';
import logger from '../utils/logger.js';

class AssetManager extends BaseManager {
  readonly description = 'Provider registry for the unified Digital Asset Management framework';

  private registry: Map<string, AssetProvider> = new Map();
  /** Last known health status for each provider, keyed by provider.id */
  private healthMap: Map<string, { status: ProviderHealthStatus; checkedAt: string; error?: string }> = new Map();

  // ---------------------------------------------------------------------------
  // pageAssets reverse index — slug → Set<"providerId:assetId">
  // ---------------------------------------------------------------------------

  /** In-memory reverse index: page slug → set of composite asset keys */
  private pageAssetsMap: Map<string, Set<string>> = new Map();
  /** Absolute path to page-assets-index.json, set during initialize() */
  private pageAssetsIndexPath: string | null = null;
  /** Serialized write queue — prevents concurrent JSON saves from conflicting */
  private pageAssetsWriteQueue: Promise<void> = Promise.resolve();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Register BasicAttachmentProvider (always present)
    const attachmentManager = this.engine.getManager<{ provider?: AssetProvider }>('AttachmentManager');
    if (attachmentManager?.provider) {
      this.registerProvider(attachmentManager.provider);
    } else {
      logger.warn('[AssetManager] AttachmentManager has no provider — skipping registration');
    }

    // Register FileSystemMediaProvider (optional — only when media is enabled)
    const mediaManager = this.engine.getManager<{ provider?: AssetProvider }>('MediaManager');
    if (mediaManager?.provider) {
      this.registerProvider(mediaManager.provider);
    }

    logger.info(`[AssetManager] Initialized with ${this.registry.size} provider(s): ${[...this.registry.keys()].join(', ')}`);

    // Run an initial health check so degraded storage (e.g. unmounted NAS/SMB
    // volumes) is detected at startup rather than on the first user request.
    await this.checkProviderHealth();

    // Resolve page-assets index path and load persisted data.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      this.pageAssetsIndexPath = configManager.getResolvedDataPath(
        'ngdpbase.asset.page-assets-index',
        './data/page-assets-index.json'
      );
      await this._loadPageAssetsIndex();
    }
  }

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------

  /**
   * Register an asset provider.  If a provider with the same id is already
   * registered it is replaced and a warning is logged.
   */
  registerProvider(provider: AssetProvider): void {
    if (this.registry.has(provider.id)) {
      logger.warn(`[AssetManager] Replacing existing provider "${provider.id}"`);
    }
    this.registry.set(provider.id, provider);
    logger.info(`[AssetManager] Registered provider "${provider.id}" (${provider.displayName})`);
  }

  /** Return a single provider by id, or null. */
  getProvider(id: string): AssetProvider | null {
    return this.registry.get(id) ?? null;
  }

  /** Return all registered providers in registration order. */
  getProviders(): AssetProvider[] {
    return [...this.registry.values()];
  }

  // ---------------------------------------------------------------------------
  // Health checking
  // ---------------------------------------------------------------------------

  /**
   * Run healthCheck() on every registered provider that implements it.
   *
   * Updates the internal health map.  Providers without a healthCheck() method
   * are marked 'healthy' (they are always assumed to be available).  Call this
   * at startup and from the admin health-check endpoint to refresh status.
   */
  async checkProviderHealth(): Promise<void> {
    for (const provider of this.registry.values()) {
      const checkedAt = new Date().toISOString();
      if (!provider.healthCheck) {
        this.healthMap.set(provider.id, { status: 'healthy', checkedAt });
        continue;
      }
      try {
        const ok = await provider.healthCheck();
        if (ok) {
          this.healthMap.set(provider.id, { status: 'healthy', checkedAt });
        } else {
          this.healthMap.set(provider.id, { status: 'degraded', checkedAt, error: 'healthCheck returned false' });
          logger.warn(`[AssetManager] Provider "${provider.id}" is degraded — will be skipped in fan-out`);
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.healthMap.set(provider.id, { status: 'degraded', checkedAt, error });
        logger.warn(`[AssetManager] Provider "${provider.id}" healthCheck threw — marking degraded: ${error}`);
      }
    }
  }

  /**
   * Return a health report for every registered provider.
   * Suitable for surfacing in an admin UI or REST endpoint.
   */
  getProviderHealth(): ProviderHealthReport[] {
    return [...this.registry.values()].map(provider => {
      const entry = this.healthMap.get(provider.id);
      return {
        providerId: provider.id,
        displayName: provider.displayName,
        status: entry?.status ?? 'unknown',
        checkedAt: entry?.checkedAt,
        error: entry?.error
      };
    });
  }

  // ---------------------------------------------------------------------------
  // pageAssets reverse index — public API
  // ---------------------------------------------------------------------------

  /**
   * Scan wiki markup content for asset references and update the reverse index
   * for the given page.  Call this fire-and-forget at page-save time.
   *
   * Handles two reference formats:
   *   [{Image src='filename.jpg'}]    → local attachment  → "local:<id>"
   *   [{ATTACH src='filename.pdf'}]   → local attachment  → "local:<id>"
   *   [{Image src='media://img.jpg'}] → media library     → "media-library:<id>"
   *
   * Runs all provider lookups concurrently; unresolvable filenames are silently
   * skipped so a missing asset never blocks the page save.
   */
  async syncPageAssets(pageName: string, content: string): Promise<void> {
    const srcPattern = /\[\{(?:Image|ATTACH)\s[^}]*?src='([^']+)'/gi;
    const composites = new Set<string>();
    let m: RegExpExecArray | null;

    type AttachmentManagerLike = { getAttachmentByFilename(f: string): Promise<{ id?: string; identifier?: string } | null> };
    type MediaManagerLike = { findByFilename(f: string): Promise<{ id: string } | null> };

    const attachmentManager = this.engine.getManager<AttachmentManagerLike>('AttachmentManager');
    const mediaManager = this.engine.getManager<MediaManagerLike>('MediaManager');

    const tasks: Promise<void>[] = [];

    while ((m = srcPattern.exec(content)) !== null) {
      const src = m[1];
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) continue;

      if (src.startsWith('media://')) {
        const filename = src.slice('media://'.length);
        tasks.push(
          (async () => {
            try {
              const item = await mediaManager?.findByFilename(filename);
              if (item?.id) composites.add(`media-library:${item.id}`);
            } catch { /* unresolvable — skip */ }
          })()
        );
      } else {
        tasks.push(
          (async () => {
            try {
              const att = await attachmentManager?.getAttachmentByFilename(src);
              const id = att?.id ?? att?.identifier;
              if (id) composites.add(`local:${id}`);
            } catch { /* unresolvable — skip */ }
          })()
        );
      }
    }

    await Promise.all(tasks);

    this.pageAssetsMap.set(pageName, composites);
    this._savePageAssetsIndex();
  }

  /**
   * Return all AssetRecords referenced by the given page slug.
   *
   * O(1) index lookup + one getById() call per referenced asset.
   * Stale entries (asset deleted or provider removed) are silently filtered out.
   */
  async getAssetsForPage(slug: string): Promise<AssetRecord[]> {
    const composites = this.pageAssetsMap.get(slug);
    if (!composites || composites.size === 0) return [];

    const results = await Promise.all(
      [...composites].map(async composite => {
        const colon = composite.indexOf(':');
        if (colon < 1) return null;
        const providerId = composite.slice(0, colon);
        const assetId = composite.slice(colon + 1);
        try {
          return await this.getById(assetId, providerId);
        } catch {
          return null;
        }
      })
    );

    return results.filter((r): r is AssetRecord => r !== null);
  }

  /**
   * Remove a page's entry from the reverse index.
   * Call this when a page is deleted or renamed.
   */
  removePageAssets(slug: string): void {
    if (!this.pageAssetsMap.has(slug)) return;
    this.pageAssetsMap.delete(slug);
    this._savePageAssetsIndex();
  }

  // ---------------------------------------------------------------------------
  // pageAssets reverse index — persistence
  // ---------------------------------------------------------------------------

  private async _loadPageAssetsIndex(): Promise<void> {
    if (!this.pageAssetsIndexPath) return;
    try {
      if (!await fs.pathExists(this.pageAssetsIndexPath)) return;
      const raw = await fs.readJson(this.pageAssetsIndexPath) as Record<string, string[]>;
      for (const [slug, ids] of Object.entries(raw)) {
        this.pageAssetsMap.set(slug, new Set(ids));
      }
      logger.info(`[AssetManager] Loaded page-assets index — ${this.pageAssetsMap.size} pages`);
    } catch (err) {
      logger.warn('[AssetManager] Could not load page-assets-index.json — starting empty:', err);
    }
  }

  /**
   * Queue an atomic write of the page-assets index.
   * Uses the same promise-chain pattern as VersioningFileProvider.savePageIndex()
   * to prevent race conditions from concurrent page saves.
   */
  private _savePageAssetsIndex(): void {
    if (!this.pageAssetsIndexPath) return;

    const indexPath = this.pageAssetsIndexPath;
    const data = JSON.stringify(
      Object.fromEntries([...this.pageAssetsMap].map(([k, v]) => [k, [...v]])),
      null, 2
    );

    this.pageAssetsWriteQueue = this.pageAssetsWriteQueue.then(async () => {
      const tmpPath = `${indexPath}.tmp.${process.pid}.${Date.now()}`;
      try {
        await fs.ensureDir(path.dirname(indexPath));
        await fs.writeFile(tmpPath, data, 'utf8');
        await fs.rename(tmpPath, indexPath);
      } catch (err) {
        try { await fs.unlink(tmpPath); } catch { /* ignore */ }
        logger.warn('[AssetManager] Failed to save page-assets-index.json:', err);
      }
    });
  }

  /** True when the provider is healthy or has no health check. */
  private isHealthy(provider: AssetProvider): boolean {
    const entry = this.healthMap.get(provider.id);
    // 'unknown' means checkProviderHealth hasn't run yet — allow through
    return !entry || entry.status !== 'degraded';
  }

  // ---------------------------------------------------------------------------
  // Unified API
  // ---------------------------------------------------------------------------

  /**
   * Search across all registered providers (or a specific one when
   * query.providerId is set), merge results, sort, and paginate.
   */
  async search(query: AssetQuery & { providerId?: string; wikiContext?: unknown } = {}): Promise<AssetPage> {
    const { pageSize = 48, offset = 0, sort = 'date', order = 'asc', providerId, ...providerQuery } = query;

    const providers = providerId
      ? (this.registry.has(providerId) ? [this.registry.get(providerId)!] : [])
      : [...this.registry.values()];

    const all: AssetRecord[] = [];
    const allAggs: AssetAggregations[] = [];

    for (const provider of providers) {
      if (!this.isHealthy(provider)) {
        logger.warn(`[AssetManager] Skipping degraded provider "${provider.id}" in search`);
        continue;
      }
      try {
        const page = await provider.search({ ...providerQuery, pageSize: 9999, offset: 0 });
        all.push(...page.results);
        if (page.aggregations) allAggs.push(page.aggregations);
      } catch (err) {
        logger.warn(`[AssetManager] Provider "${provider.id}" search failed:`, err);
      }
    }

    this._sort(all, sort, order);

    const total = all.length;
    const results = all.slice(offset, offset + pageSize);
    const aggregations = this._mergeAggregations(allAggs);
    return { results, total, hasMore: offset + results.length < total, ...(aggregations ? { aggregations } : {}) };
  }

  /**
   * Retrieve a single asset by id.  If providerId is given only that provider
   * is checked; otherwise all providers are tried in registration order.
   */
  async getById(id: string, providerId?: string): Promise<AssetRecord | null> {
    const providers = providerId
      ? (this.registry.has(providerId) ? [this.registry.get(providerId)!] : [])
      : [...this.registry.values()];

    for (const provider of providers) {
      if (!this.isHealthy(provider)) {
        logger.warn(`[AssetManager] Skipping degraded provider "${provider.id}" in getById`);
        continue;
      }
      try {
        const record = await provider.getById(id);
        if (record) return record;
      } catch (err) {
        logger.warn(`[AssetManager] Provider "${provider.id}" getById failed:`, err);
      }
    }
    return null;
  }

  /**
   * Generate or retrieve a cached thumbnail.
   * Requires the provider to declare the 'thumbnail' capability.
   */
  async getThumbnail(id: string, providerId: string, size = '150x150'): Promise<Buffer | null> {
    const provider = this.registry.get(providerId);
    if (!provider) {
      logger.warn(`[AssetManager] getThumbnail: unknown provider "${providerId}"`);
      return null;
    }
    if (!provider.capabilities.includes('thumbnail') || !provider.getThumbnail) {
      return null;
    }
    try {
      return await provider.getThumbnail(id, size);
    } catch (err) {
      logger.warn(`[AssetManager] Provider "${providerId}" getThumbnail failed:`, err);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _mergeAggregations(aggs: AssetAggregations[]): AssetAggregations | undefined {
    if (!aggs.length) return undefined;
    const merge = (key: keyof AssetAggregations): AssetFacet[] | undefined => {
      const map = new Map<string, number>();
      for (const agg of aggs) {
        for (const facet of agg[key] ?? []) {
          map.set(facet.key, (map.get(facet.key) ?? 0) + facet.count);
        }
      }
      return map.size ? [...map.entries()].map(([k, c]) => ({ key: k, count: c })).sort((a, b) => b.count - a.count) : undefined;
    };
    const result: AssetAggregations = {};
    const byMime = merge('byMime'); if (byMime) result.byMime = byMime;
    const byYear = merge('byYear'); if (byYear) result.byYear = byYear;
    const byFolder = merge('byFolder'); if (byFolder) result.byFolder = byFolder;
    const byExtension = merge('byExtension'); if (byExtension) result.byExtension = byExtension;
    return Object.keys(result).length ? result : undefined;
  }

  private _sort(items: AssetRecord[], sort: 'date' | 'caption', order: 'asc' | 'desc'): void {
    const asc = order === 'asc';
    items.sort((a, b) => {
      let cmp: number;
      if (sort === 'caption') {
        const cap = (r: AssetRecord): string => (r.description ?? r.filename ?? '').toLowerCase();
        cmp = cap(a).localeCompare(cap(b));
      } else {
        const ts = (r: AssetRecord): number => (r.dateCreated ? new Date(r.dateCreated).getTime() : 0);
        cmp = ts(a) - ts(b);
      }
      return asc ? cmp : -cmp;
    });
  }
}

export default AssetManager;

