/**
 * CatalogManager — controlled-vocabulary registry for system keywords (#424).
 *
 * Provides a pluggable provider registry so that:
 *   - Core config-driven terms come from DefaultCatalogProvider
 *   - Addons contribute domain vocabularies via registerProvider()
 *   - Future AI-based term suggestion is scaffolded via AICatalogProvider
 *
 * Registration pattern (in addon's register() hook):
 *   const catalog = engine.getManager<CatalogManager>('CatalogManager');
 *   if (catalog) catalog.registerProvider(new GeoscienceCatalogProvider());
 *
 * Related: #424 (CatalogManager), #507 (auto-tagging), #149 (microdata itemid)
 */

import path from 'path';
import fs from 'fs-extra';
import BaseManager, { type BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { CatalogProvider, CatalogTerm } from '../types/Catalog.js';
import type {
  CatalogSource,
  CatalogQuery,
  CatalogPage,
  CreativeWork,
  SchemaVersionReport,
  SchemaType
} from '../types/Schema.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// DefaultCatalogProvider — reads ngdpbase.system-keywords from config
// ---------------------------------------------------------------------------

interface SystemKeywordConfig {
  label?: string;
  description?: string;
  category?: CatalogTerm['category'];
  default?: boolean;
  enabled?: boolean;
  uri?: string;
  source?: string;
}

class DefaultCatalogProvider implements CatalogProvider {
  readonly id = 'default';
  readonly displayName = 'Default Catalog Provider';

  private engine: WikiEngine;

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  getTerms(): Promise<CatalogTerm[]> {
    const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!cfg) return Promise.resolve([]);

    const raw = cfg.getProperty('ngdpbase.system-keywords', {}) as Record<string, SystemKeywordConfig>;
    if (!raw || typeof raw !== 'object') return Promise.resolve([]);

    return Promise.resolve(
      Object.entries(raw)
        .filter(([, v]) => v.enabled !== false)
        .map(([key, v]) => ({
          term: key,
          label: v.label ?? key,
          uri: v.uri,
          source: v.source ?? 'config',
          category: v.category,
          default: v.default ?? false,
          enabled: v.enabled !== false
        }))
    );
  }

  async resolveUri(term: string): Promise<string | null> {
    const terms = await this.getTerms();
    return terms.find(t => t.term === term)?.uri ?? null;
  }
}

// ---------------------------------------------------------------------------
// UserKeywordsCatalogProvider — reads ngdpbase.user-keywords from config
// (#894, Slice 2 of #869)
// ---------------------------------------------------------------------------

export interface UserKeywordConfig {
  label?: string;
  description?: string;
  category?: CatalogTerm['category'];
  enabled?: boolean;
  restrictEditing?: boolean;
  allowedRoles?: string[];
  uri?: string;
  source?: string;
}

/**
 * Serves the user-keywords vocabulary (the human tagging bucket in the #869
 * five-bucket model) through the provider registry, so it shares one interface
 * with system-keywords: SKOS ConceptScheme emission at
 * /api/catalog/vocabulary/user-keywords, altLabels aliasing later, and the
 * drift report's canonical side.
 *
 * #896: vocabulary is content, not configuration. Two layers:
 *   - SEED — `ngdpbase.user-keywords` read from the SHIPPED defaults only
 *     (`getDefaultProperty`), so legacy whole-catalog snapshots in instance
 *     custom config can't shadow it (the #895 propagation bug).
 *   - STORE — `<instance-data>/vocabulary/user-keywords.json`, read-write,
 *     owned by this provider. Holds instance-created/adopted terms and
 *     per-key overrides of seed entries (disable = `enabled:false` delta).
 * `getCatalogObject()` merges the two (store wins per key);
 * `saveCatalogObject()` diffs against the seed and persists only deltas.
 * All catalog writes (admin CRUD, drift Adopt, import auto-register) go
 * through this provider — never through ConfigurationManager.setProperty.
 */
export class UserKeywordsCatalogProvider implements CatalogProvider {
  readonly id = 'user-keywords';
  readonly displayName = 'User Keywords';
  readonly domain = 'user-keywords';

  private engine: WikiEngine;

  constructor(engine: WikiEngine) {
    this.engine = engine;
  }

  /** Absolute path of the instance vocabulary store. */
  getStorePath(): string | null {
    const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!cfg?.getInstanceDataFolder) return null;
    return path.join(cfg.getInstanceDataFolder(), 'vocabulary', 'user-keywords.json');
  }

  private seedCatalog(): Record<string, UserKeywordConfig> {
    const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!cfg) return {};
    const getDefault = (cfg as unknown as { getDefaultProperty?: (k: string, d: unknown) => unknown }).getDefaultProperty;
    const raw = getDefault
      ? getDefault.call(cfg, 'ngdpbase.user-keywords', {})
      : cfg.getProperty('ngdpbase.user-keywords', {});
    return (raw && typeof raw === 'object') ? raw as Record<string, UserKeywordConfig> : {};
  }

  private async readStore(): Promise<Record<string, UserKeywordConfig>> {
    const storePath = this.getStorePath();
    if (!storePath) return {};
    try {
      if (!(await fs.pathExists(storePath))) return {};
      const raw = await fs.readJson(storePath) as unknown;
      return (raw && typeof raw === 'object') ? raw as Record<string, UserKeywordConfig> : {};
    } catch (err) {
      logger.warn('[UserKeywordsCatalogProvider] store unreadable, treating as empty:', err);
      return {};
    }
  }

  /**
   * Full catalog as an id-keyed object (seed merged with store, store wins).
   * Includes disabled entries — callers filter as needed.
   */
  async getCatalogObject(): Promise<Record<string, UserKeywordConfig>> {
    return { ...this.seedCatalog(), ...(await this.readStore()) };
  }

  /**
   * Persist a full catalog object. Only deltas against the seed are written
   * to the store: entries identical to their seed counterpart are omitted;
   * seed entries absent from `catalog` are stored as `enabled:false`
   * overrides (a seed key can't be deleted, only disabled).
   */
  async saveCatalogObject(catalog: Record<string, UserKeywordConfig>): Promise<void> {
    const storePath = this.getStorePath();
    if (!storePath) throw new Error('UserKeywordsCatalogProvider: no store path (ConfigurationManager unavailable)');
    const seed = this.seedCatalog();
    const store: Record<string, UserKeywordConfig> = {};
    for (const [id, entry] of Object.entries(catalog)) {
      const seedEntry = seed[id];
      if (seedEntry && JSON.stringify(seedEntry) === JSON.stringify(entry)) continue;
      store[id] = entry;
    }
    for (const id of Object.keys(seed)) {
      if (!(id in catalog)) store[id] = { ...seed[id], enabled: false };
    }
    await fs.ensureDir(path.dirname(storePath));
    await fs.writeJson(storePath, store, { spaces: 2 });
  }

  /**
   * #896 backup contract: raw instance-store contents (NOT the merged
   * catalog — the seed ships with the code and needs no backup).
   */
  async readStoreForBackup(): Promise<Record<string, UserKeywordConfig>> {
    return this.readStore();
  }

  /** #896 restore contract: write store contents verbatim (no delta pass). */
  async restoreStore(store: Record<string, UserKeywordConfig>): Promise<void> {
    const storePath = this.getStorePath();
    if (!storePath) throw new Error('UserKeywordsCatalogProvider: no store path (ConfigurationManager unavailable)');
    await fs.ensureDir(path.dirname(storePath));
    await fs.writeJson(storePath, store, { spaces: 2 });
  }

  getTerms(): Promise<CatalogTerm[]> {
    return this.getCatalogObject().then(catalog =>
      Object.entries(catalog)
        .filter(([, v]) => v.enabled !== false)
        .map(([key, v]) => ({
          term: key,
          label: v.label ?? key,
          uri: v.uri,
          source: v.source ?? 'config',
          description: v.description,
          category: v.category,
          enabled: v.enabled !== false
        }))
    );
  }

  async resolveUri(term: string): Promise<string | null> {
    const terms = await this.getTerms();
    return terms.find(t => t.term === term)?.uri ?? null;
  }
}

// ---------------------------------------------------------------------------
// AICatalogProvider — Phase 4 scaffold
// ---------------------------------------------------------------------------

class AICatalogProvider implements CatalogProvider {
  readonly id = 'ai';
  readonly displayName = 'AI Catalog Provider';

  private enabled: boolean;
  private threshold: number;

  constructor(engine: WikiEngine) {
    const cfg = engine.getManager<ConfigurationManager>('ConfigurationManager');
    this.enabled = (cfg?.getProperty('ngdpbase.catalog.ai.enabled', false) as boolean) ?? false;
    this.threshold = (cfg?.getProperty('ngdpbase.catalog.ai.threshold', 0.7) as number) ?? 0.7;
  }

  getTerms(): Promise<CatalogTerm[]> {
    // AI provider does not own terms — it only suggests them
    return Promise.resolve([]);
  }

  suggestTerms(content: string, title: string): Promise<CatalogTerm[]> {
    void content; void title; void this.threshold;
    if (!this.enabled) return Promise.resolve([]);
    // Scaffold: no LLM wired yet. An LLM addon replaces this by calling
    // catalogManager.registerProvider(realAiProvider) in its register() hook.
    logger.debug('[AICatalogProvider] no LLM configured — returning empty suggestions');
    return Promise.resolve([]);
  }
}

// ---------------------------------------------------------------------------
// CatalogManager
// ---------------------------------------------------------------------------

class CatalogManager extends BaseManager {
  readonly description = 'Two-registry coordinator: vocabulary providers (#424) + asset sources (#755)';

  private providers: Map<string, CatalogProvider> = new Map();
  private aiProvider: AICatalogProvider | null = null;

  /**
   * Asset-source registry (Slice 3 of #755).
   *
   * Parallel to the vocabulary `providers` map. Each entry is a Manager
   * (PageManager, MediaManager, AttachmentManager) that produces CreativeWork
   * records — see `src/types/Schema.ts` `CatalogSource` interface.
   */
  private sources: Map<string, CatalogSource> = new Map();

  constructor(engine: WikiEngine) {
    super(engine);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Always register the default (config-driven) provider
    const defaultProvider = new DefaultCatalogProvider(this.engine);
    this.registerProvider(defaultProvider);

    // #894 (Slice 2 of #869): user-keywords vocabulary joins the registry
    this.registerProvider(new UserKeywordsCatalogProvider(this.engine));

    // Register AI provider scaffold (Phase 4)
    this.aiProvider = new AICatalogProvider(this.engine);
    this.registerProvider(this.aiProvider);

    const cfg = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const aiEnabled = cfg?.getProperty('ngdpbase.catalog.ai.enabled', false) as boolean;

    logger.info(`[CatalogManager] Initialized — ${this.providers.size} provider(s): ${[...this.providers.keys()].join(', ')}`);
    if (!aiEnabled) {
      logger.debug('[CatalogManager] AICatalogProvider registered (stub — no LLM wired)');
    }

    this.initialized = true;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a catalog provider.
   * Addons call this in their register() hook to contribute domain vocabularies.
   * Calling registerProvider() with an id that already exists replaces the prior provider.
   */
  registerProvider(provider: CatalogProvider): void {
    this.providers.set(provider.id, provider);
    logger.debug(`[CatalogManager] Registered provider: ${provider.id} (${provider.displayName})`);
  }

  /**
   * Return all terms from all registered providers, merged in registration order.
   * @param domain Optional domain filter — only includes providers with a matching domain
   *               (providers with no domain set are always included).
   */
  async getTerms(domain?: string): Promise<CatalogTerm[]> {
    const all: CatalogTerm[] = [];
    for (const provider of this.providers.values()) {
      if (domain && provider.domain && provider.domain !== domain) continue;
      try {
        const terms = await provider.getTerms();
        all.push(...terms);
      } catch (err) {
        logger.warn(`[CatalogManager] getTerms failed for provider '${provider.id}':`, err);
      }
    }
    return all;
  }

  /**
   * Resolve a term string to a Linked-Data URI.
   * Walks providers in registration order; returns the first non-null hit.
   */
  async resolveUri(term: string): Promise<string | null> {
    for (const provider of this.providers.values()) {
      if (!provider.resolveUri) continue;
      try {
        const uri = await provider.resolveUri(term);
        if (uri) return uri;
      } catch (err) {
        logger.warn(`[CatalogManager] resolveUri failed for provider '${provider.id}':`, err);
      }
    }
    return null;
  }

  /**
   * Suggest controlled-vocabulary terms for the given page content.
   * Delegates to any provider that implements suggestTerms().
   * Returns [] when no AI provider is wired or ai is disabled.
   */
  async suggestTerms(content: string, title: string): Promise<CatalogTerm[]> {
    const suggestions: CatalogTerm[] = [];
    for (const provider of this.providers.values()) {
      if (!provider.suggestTerms) continue;
      try {
        const terms = await provider.suggestTerms(content, title);
        suggestions.push(...terms);
      } catch (err) {
        logger.warn(`[CatalogManager] suggestTerms failed for provider '${provider.id}':`, err);
      }
    }
    return suggestions;
  }

  /**
   * Return info about all registered providers (for admin UIs / diagnostics).
   */
  getProviderInfo(): Array<{ id: string; displayName: string; domain?: string }> {
    return [...this.providers.values()].map(p => ({
      id: p.id,
      displayName: p.displayName,
      domain: p.domain
    }));
  }

  /**
   * Slice 6c of #760 (#767) — return one provider's terms for SKOS emission.
   * The aggregate `getTerms()` is the wrong surface for SKOS publishing:
   * `/api/catalog/vocabulary/<scheme-id>` is per-provider, so the route
   * needs per-provider access. Returns null when the schemeId doesn't match
   * a registered provider (caller renders 404).
   */
  /**
   * #896: typed accessor for the user-keywords provider — the write interface
   * for the instance vocabulary store (admin CRUD, drift Adopt, import
   * auto-register all go through it).
   */
  getUserKeywordsProvider(): UserKeywordsCatalogProvider | null {
    const p = this.providers.get('user-keywords');
    return p instanceof UserKeywordsCatalogProvider ? p : null;
  }

  async getProviderTerms(schemeId: string): Promise<{ displayName: string; terms: CatalogTerm[] } | null> {
    const provider = this.providers.get(schemeId);
    if (!provider) return null;
    try {
      const terms = await provider.getTerms();
      return { displayName: provider.displayName, terms };
    } catch (err) {
      logger.warn(`[CatalogManager] getProviderTerms failed for provider '${schemeId}':`, err);
      return { displayName: provider.displayName, terms: [] };
    }
  }

  // ===========================================================================
  // Asset-source registry (Slice 3 of #755) — designed in docs/managers/CatalogManager.md
  // ===========================================================================

  /**
   * Register an asset source (Slice 3 of #755).
   *
   * PageManager, MediaManager, AttachmentManager call this during their own
   * `initialize()` to expose CreativeWork records via this Manager. Replacing
   * by `sourceId` is allowed (last registration wins).
   */
  registerSource(source: CatalogSource): void {
    this.sources.set(source.sourceId, source);
    logger.debug(`[CatalogManager] Registered source: ${source.sourceId} (types: ${source.types.join(', ')}, schemaVersion: ${source.currentSchemaVersion})`);
  }

  /**
   * Look up a single CreativeWork by stable identifier across all registered
   * sources. Returns the first non-null hit; returns null when no source has
   * the identifier or all matching sources filter it out via ACL.
   *
   * Pass `opts.sourceId` to restrict the lookup to one source — useful when
   * the caller already knows which source owns the record.
   */
  async getCreativeWork(
    identifier: string,
    opts?: { sourceId?: string }
  ): Promise<CreativeWork | null> {
    const targetSourceId = opts?.sourceId;
    const sources = targetSourceId
      ? (this.sources.get(targetSourceId) ? [this.sources.get(targetSourceId) as CatalogSource] : [])
      : [...this.sources.values()];

    for (const source of sources) {
      try {
        const work = await source.get(identifier);
        if (work) return work;
      } catch (err) {
        logger.warn(`[CatalogManager] getCreativeWork failed for source '${source.sourceId}':`, err);
      }
    }
    return null;
  }

  /**
   * List CreativeWorks across registered sources matching the query.
   *
   * When `query.types` is set, only sources advertising at least one of the
   * requested @types are queried. Cursors are scoped to a single source —
   * callers paginating across multiple sources receive items in source
   * registration order without a unified cursor (initial slice; can be
   * extended once a real consumer needs cross-source pagination).
   */
  async listCreativeWorks(query: CatalogQuery): Promise<CatalogPage> {
    const wanted: SchemaType[] | undefined = query.types && query.types.length > 0 ? query.types : undefined;
    const candidates = [...this.sources.values()].filter(s =>
      !wanted || s.types.some(t => wanted.includes(t))
    );

    const collected: CreativeWork[] = [];
    let totalsSum = 0;
    let cursor: string | undefined;
    for (const source of candidates) {
      try {
        const page = await source.list(query);
        collected.push(...page.items);
        if (typeof page.total === 'number') totalsSum += page.total;
        if (page.cursor && !cursor) cursor = page.cursor;
      } catch (err) {
        logger.warn(`[CatalogManager] listCreativeWorks failed for source '${source.sourceId}':`, err);
      }
    }
    return { items: collected, total: totalsSum, ...(cursor ? { cursor } : {}) };
  }

  /**
   * Check whether each source's on-disk index is up to date with its in-code
   * `currentSchemaVersion` constant (Decision 6). Sources report `isStale =
   * true` when the index file lags behind code; the admin dashboard surfaces
   * a banner per stale source.
   *
   * Each source is expected to compare its own on-disk version against
   * `currentSchemaVersion` and return both numbers. CatalogManager just
   * aggregates and routes the report to consumers.
   */
  checkSchemaVersions(): SchemaVersionReport {
    return [...this.sources.values()].map(source => {
      const onDisk = this.readOnDiskSchemaVersion(source);
      return {
        sourceId: source.sourceId,
        currentSchemaVersion: source.currentSchemaVersion,
        onDiskSchemaVersion: onDisk,
        isStale: onDisk < source.currentSchemaVersion
      };
    });
  }

  /**
   * Reads the on-disk schemaVersion from a source.
   *
   * For now this just returns the source's currentSchemaVersion — the per-file
   * on-disk schemaVersion machinery (Decision 6) is wired in later slices as
   * each source's persisted index file gains the `schemaVersion` field.
   * Until then, all sources report fresh, which matches the actual state
   * (everything is at v1, no upgrade-from-prior-version path needed yet).
   */
  private readOnDiskSchemaVersion(source: CatalogSource): number {
    return source.currentSchemaVersion;
  }

  /** Diagnostics — list registered sources for admin UIs / dashboards. */
  getSourceInfo(): Array<{ sourceId: string; types: readonly SchemaType[]; currentSchemaVersion: number }> {
    return [...this.sources.values()].map(s => ({
      sourceId: s.sourceId,
      types: s.types,
      currentSchemaVersion: s.currentSchemaVersion
    }));
  }

  // -------------------------------------------------------------------------
  // Backup / restore (per-manager contract collected by BackupManager)
  // -------------------------------------------------------------------------

  /**
   * #896: back up the instance vocabulary store(s). Only provider-owned
   * instance data is included — the seed vocabulary ships with the code and
   * the AI provider owns no terms. Keyed by provider id so future
   * provider-owned stores slot in without a format change.
   */
  async backup(): Promise<BackupData> {
    const vocabularyStores: Record<string, Record<string, UserKeywordConfig>> = {};
    const ukProvider = this.getUserKeywordsProvider();
    if (ukProvider) {
      try {
        vocabularyStores['user-keywords'] = await ukProvider.readStoreForBackup();
      } catch (err) {
        logger.warn('[CatalogManager] backup: user-keywords store unreadable:', err);
      }
    }
    return {
      managerName: this.constructor.name,
      timestamp: new Date().toISOString(),
      data: { vocabularyStores }
    };
  }

  /**
   * #896: restore instance vocabulary store(s) written by backup().
   */
  async restore(backupData: BackupData): Promise<void> {
    await super.restore(backupData);
    const data = backupData.data as { vocabularyStores?: Record<string, Record<string, UserKeywordConfig>> } | null;
    const stores = data?.vocabularyStores;
    if (!stores || typeof stores !== 'object') return;
    const ukStore = stores['user-keywords'];
    if (ukStore && typeof ukStore === 'object') {
      const ukProvider = this.getUserKeywordsProvider();
      if (!ukProvider) {
        logger.warn('[CatalogManager] restore: user-keywords provider unavailable — store not restored');
        return;
      }
      await ukProvider.restoreStore(ukStore);
      logger.info(`[CatalogManager] restored user-keywords vocabulary store (${Object.keys(ukStore).length} entries)`);
    }
  }
}

export default CatalogManager;

