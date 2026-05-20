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

import BaseManager from './BaseManager.js';
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
}

export default CatalogManager;

