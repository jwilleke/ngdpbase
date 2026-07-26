import path from 'path';
import fse from 'fs-extra';
import matter from 'gray-matter';
import BaseManager, { BackupData } from './BaseManager.js';
import logger from '../utils/logger.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { PageProvider, ProviderInfo, RecentChangesOptions, RecentChangeEntry, GetPagesByCreatorOptions, PagesScanOptions } from '../types/Provider.js';
import { WikiPage, PageFrontmatter } from '../types/Page.js';
import type {
  CatalogSource,
  CatalogQuery,
  CatalogPage,
  CreativeWork,
  RebuildOpts,
  SchemaType
} from '../types/Schema.js';
import { pageToArticle } from '../utils/pageToArticle.js';
import { dedupeKeywords, normalizeKeywordValue } from '../utils/keywordNormalizer.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type CatalogManager from './CatalogManager.js';
import type ValidationManager from './ValidationManager.js';
import type NotificationManager from './NotificationManager.js';

/**
 * Minimal WikiContext interface for type safety
 * TODO: Convert WikiContext.js to TypeScript and import proper type
 */
interface WikiContext {
  pageName: string;
  content: string;
  userContext?: {
    username?: string;
  };
  /** Used by checkPrivatePageAccess (#711) for the admin bypass. */
  hasRole?(...roles: string[]): boolean;
}

/**
 * Provider constructor type for dynamic loading
 */
interface ProviderConstructor {
  new (engine: WikiEngine): PageProvider;
}

/**
 * PageManager - Manages wiki page operations through a pluggable provider system
 *
 * Follows JSPWiki's provider pattern where the actual storage implementation
 * is abstracted behind a provider interface. This allows for different storage
 * backends (filesystem, database, cloud, etc.) to be swapped via configuration.
 *
 * The PageManager acts as a thin coordinator that:
 * - Loads the configured provider (via "ngdpbase.page.provider")
 * - Proxies all page operations to the provider
 * - Maintains the public API for backward compatibility
 *
 * @class PageManager
 * @extends BaseManager
 *
 * @property {PageProvider|null} provider - The active page storage provider
 * @property {string} providerClass - The class name of the loaded provider
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link FileSystemProvider} for default provider implementation
 *
 * @example
 * const pageManager = engine.getManager('PageManager');
 * const page = await pageManager.getPage('Main');
 * console.log(page.content);
 */
class PageManager extends BaseManager implements CatalogSource {
  /** CatalogSource identifier (Slice 4 of #755 / #772). */
  readonly sourceId = 'pages';

  /**
   * Subtypes this source produces. Pages always map to Article (Decision 1).
   * Very-sparse pre-#754 pages still produce Article — `dateCreated` is the
   * only Article-distinctive field and it's now mandatory after the
   * #754 backfill (v3.33.0).
   */
  readonly types: readonly SchemaType[] = ['Article'];

  /**
   * On-disk schema version for the page-frontmatter shape (Decision 6).
   * Bump when the persisted Article-relevant fields on a page change. v1 is
   * the post-#754 (v3.33.0) shape, which adds the required `created`
   * timestamp to every page.
   */
  static readonly CURRENT_SCHEMA_VERSION = 1;
  readonly currentSchemaVersion = PageManager.CURRENT_SCHEMA_VERSION;

  private provider: PageProvider | null = null;
  private providerClass?: string;

  /**
   * Creates a new PageManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initialize the PageManager by loading and initializing the configured provider
   *
   * Reads the page provider configuration and dynamically loads the provider class.
   * The provider name is normalized from lowercase (config) to PascalCase (class name).
   *
   * @async
   * @param {Object} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available or provider fails to load
   *
   * @example
   * await pageManager.initialize();
   * // Loads FileSystemProvider by default
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('PageManager requires ConfigurationManager');
    }

    // Check if page storage is enabled (ALL LOWERCASE)
    const pageEnabled = configManager.getProperty('ngdpbase.page.enabled', true) as boolean;
    if (!pageEnabled) {
      logger.info('📄 PageManager: Page storage disabled by configuration');
      return;
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.page.provider.default', 'filesystemprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.page.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    this.providerClass = this.normalizeProviderName(providerName);

    logger.info(`📄 Loading page provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    try {
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: ProviderConstructor };
      const ProviderClass = mod.default;

      this.provider = new ProviderClass(this.engine);
      if (this.provider) {
        await this.provider.initialize();
      }

      const info = this.getProviderInfo();
      logger.info(`📄 PageManager initialized with ${info.name} v${info.version}`);
      if (info.features && info.features.length > 0) {
        logger.info(`📄 Provider features: ${info.features.join(', ')}`);
      }

      await this.seedRequiredPages(configManager);
    } catch (error) {
      logger.error(`📄 Failed to initialize page provider: ${this.providerClass}`, error);
      throw error;
    }

    // Slice 4 of #755 (#772) — register as a CatalogSource so CatalogManager
    // can fan out cross-source queries. Mirrors MediaManager (Slice 3 / #758)
    // and AttachmentManager (Slice 5 / #759). CatalogManager is initialised
    // before PageManager in WikiEngine bootstrap.
    const catalog = this.engine.getManager<CatalogManager>('CatalogManager');
    if (catalog) {
      catalog.registerSource(this);
    } else {
      logger.warn('📄 CatalogManager not available at initialize — skipping CatalogSource registration');
    }
  }

  // ===========================================================================
  // CatalogSource interface (Slice 4 of #755 / #772)
  // ===========================================================================

  /**
   * Convert a single page (frontmatter + name) to its schema.org `Article`
   * record. Public so view-page / API consumers can build the same shape
   * without rerouting through `CatalogManager`.
   *
   * The render mapper for the `<script type="application/ld+json">` block on
   * `view.ejs` is a separate utility (`src/utils/buildPageJsonLd.ts`) — it
   * adds `@context` and a couple of JSON-LD-render conventions on top of this
   * internal record. Per `docs/schemas.md` Decision 11.
   */
  toCreativeWork(
    pageName: string,
    metadata: PageFrontmatter | null | undefined,
    options?: { baseUrl?: string; autoTaggedKeywords?: string[] }
  ): CreativeWork {
    return pageToArticle(pageName, metadata, options);
  }

  /**
   * CatalogSource.get — fetch a single page by UUID and return its `Article`.
   *
   * Returns null for unknown UUIDs. ACL filtering is **not** applied here —
   * callers needing the full WikiContext path should go through `getPage()`.
   * (Same convention as `MediaManager.get` / `AttachmentManager.get`.)
   */
  async get(identifier: string): Promise<CreativeWork | null> {
    if (!this.provider) return null;
    const page = await this.provider.getPageByUUID(identifier);
    if (!page) return null;
    return pageToArticle(page.title, page.metadata);
  }

  /**
   * CatalogSource.list — paginated list of CreativeWorks across all pages.
   *
   * Initial implementation: pulls `getAllPageInfo()`, applies text / keyword
   * / type / dateRange filters in-process, returns up to `query.limit`
   * items. Cursor pagination is not implemented yet — the existing
   * search-provider path (Lunr / ES) is the production query surface;
   * this method exists so cross-source CatalogManager fan-out works.
   */
  async list(query: CatalogQuery): Promise<CatalogPage> {
    if (!this.provider) return { items: [], total: 0 };

    // Type filter: PageManager only produces Article. If the caller asked
    // for a non-Article type, short-circuit.
    if (query.types && query.types.length > 0 && !query.types.includes('Article')) {
      return { items: [], total: 0 };
    }

    const allInfo = await this.provider.getAllPageInfo();

    // Convert to Articles upfront so filters can match against the
    // schema-shaped fields (keywords, dateCreated, etc.).
    let articles = allInfo.map(info => pageToArticle(info.title, info.metadata));

    if (query.text) {
      const lower = query.text.toLowerCase();
      articles = articles.filter(a =>
        a.name.toLowerCase().includes(lower) ||
        (a.description ?? '').toLowerCase().includes(lower) ||
        (a.keywords ?? []).some(k => k.toLowerCase().includes(lower))
      );
    }

    if (query.keywords && query.keywords.length > 0) {
      const wanted = new Set(query.keywords);
      articles = articles.filter(a => (a.keywords ?? []).some(k => wanted.has(k)));
    }

    if (query.dateRange) {
      const { from, to } = query.dateRange;
      articles = articles.filter(a => {
        const dc = a.dateCreated;
        if (!dc) return false;
        if (from && dc < from) return false;
        if (to && dc > to) return false;
        return true;
      });
    }

    const total = articles.length;
    const limit = typeof query.limit === 'number' && query.limit > 0 ? query.limit : articles.length;
    const items: CreativeWork[] = articles.slice(0, limit);
    return { items, total };
  }

  /**
   * CatalogSource.rebuild — re-scan storage and rebuild the page-index. Wraps
   * `provider.refreshPageList()`. The `force` option is accepted for
   * `RebuildOpts` compatibility but doesn't change behavior — the underlying
   * provider always does a full rescan.
   */
  async rebuild(_opts?: RebuildOpts): Promise<void> {
    if (!this.provider) return;
    await this.provider.refreshPageList();
  }

  /**
   * Seed required-pages into provider storage on fresh install.
   * Runs only when data/pages/ is empty or .install-complete is missing.
   * Uses the same syncFile logic as adminSyncRequiredPages() — provider-agnostic
   * at the file level for FileSystemProvider-compatible storage.
   */
  private async seedRequiredPages(configManager: ConfigurationManager): Promise<void> {
    try {
      const pagesDirResolved: string = configManager.getResolvedDataPath(
        'ngdpbase.page.provider.filesystem.storagedir',
        './data/pages'
      );
      const dataDir = path.dirname(pagesDirResolved);
      const installCompletePath = path.join(dataDir, '.install-complete');

      // Check conditions: skip SEEDING if install is already complete AND pages
      // exist — but not silently. #954: this used to return outright, which made
      // the function a first-install seeder and nothing else. A required page
      // deleted later was never noticed, never re-seeded and never reported, at
      // any point, ever. Established instances now get an integrity check.
      const installComplete: boolean = await fse.pathExists(installCompletePath);
      if (installComplete) {
        const existing: string[] = await fse.readdir(pagesDirResolved).catch(() => []);
        if (existing.filter((f: string) => f.endsWith('.md')).length > 0) {
          logger.debug('[PageManager] Required pages seed skipped — installation already complete');
          await this.reportMissingRequiredPages(configManager, pagesDirResolved);
          return;
        }
      }

      const requiredDirRaw: string = configManager.getProperty(
        'ngdpbase.page.provider.filesystem.requiredpagesdir',
        './required-pages'
      ) as string;
      const requiredDir = path.isAbsolute(requiredDirRaw)
        ? requiredDirRaw
        : path.join(process.cwd(), requiredDirRaw);

      if (!(await fse.pathExists(requiredDir))) {
        logger.warn('[PageManager] Required pages directory not found, skipping seed:', requiredDir);
        return;
      }

      await fse.ensureDir(pagesDirResolved);

      const files: string[] = (await fse.readdir(requiredDir))
        .filter((f: string) => f.endsWith('.md'));

      // Build a set of system-category values whose storageLocation is 'github'
      // (i.e. pages that live only in the source tree and must never be seeded to data/).
      const systemCategories = configManager.getProperty('ngdpbase.system-category', {}) as
        Record<string, { storageLocation?: string }>;
      const githubOnlyCategories = new Set(
        Object.entries(systemCategories)
          .filter(([, cfg]) => cfg.storageLocation === 'github')
          .map(([key]) => key)
      );

      let seeded = 0;
      let skipped = 0;
      let devSkipped = 0;

      for (const file of files) {
        const srcPath = path.join(requiredDir, file);
        const dstPath = path.join(pagesDirResolved, file);

        if (await fse.pathExists(dstPath)) {
          skipped++;
          continue;
        }

        // Same logic as adminSyncRequiredPages syncFile(): strip user-modified on copy
        const raw: string = await fse.readFile(srcPath, 'utf8');
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };

        // Skip pages whose system-category is github-only (e.g. 'developer')
        const pageCategory = parsed.data['system-category'] as string | undefined;
        if (pageCategory && githubOnlyCategories.has(pageCategory)) {
          const pageTitle = typeof parsed.data['title'] === 'string' ? parsed.data['title'] : file;
          logger.debug(`[PageManager] Skipping github-only page (${pageCategory}): ${pageTitle}`);
          devSkipped++;
          continue;
        }

        delete parsed.data['user-modified'];
        const cleaned: string = matter.stringify(parsed.content, parsed.data);
        await fse.writeFile(dstPath, cleaned, 'utf8');
        seeded++;
      }

      logger.info(`[PageManager] Required pages seeded: ${seeded} new, ${skipped} already present${devSkipped ? `, ${devSkipped} github-only skipped` : ''}`);

      if (devSkipped > 0) {
        try {
          const notificationManager = this.engine.getManager<NotificationManager>('NotificationManager');
          if (notificationManager?.createNotification) {
            await notificationManager.createNotification({
              type: 'system',
              level: 'info',
              title: 'Developer pages excluded from seed',
              message: `${devSkipped} github-only page${devSkipped === 1 ? '' : 's'} in required-pages/ ${devSkipped === 1 ? 'was' : 'were'} skipped during seeding (system-category with storageLocation=github). These pages are source-tree only and will not appear in the wiki.`
            });
          }
        } catch {
          // non-fatal
        }
      }
    } catch (err) {
      logger.error('[PageManager] Failed to seed required pages:', err);
    }
  }

  /**
   * Report required pages that are missing from an established instance (#954).
   *
   * `seedRequiredPages` only ever ran on a fresh install, so a required page
   * deleted afterwards was invisible forever — no log, no notification, no
   * re-seed. The page simply stopped existing and nothing said so.
   *
   * **Reports; never re-seeds.** Silently restoring pages at boot would fight
   * the operator: a required page can be deleted deliberately, and since #947 a
   * delete is a recoverable soft delete, so resurrecting a copy at boot would
   * leave a live page *and* a tombstone of the same thing. Detection is the
   * missing capability here; the remedy is already available through the admin
   * Required Pages Sync tool, and choosing to apply it belongs to the operator.
   *
   * Best-effort: a failure here must never block startup.
   *
   * @param configManager - For the required-pages directory and category catalog
   * @param pagesDirResolved - Live page storage directory
   */
  private async reportMissingRequiredPages(
    configManager: ConfigurationManager,
    pagesDirResolved: string
  ): Promise<void> {
    try {
      const requiredDirRaw: string = configManager.getProperty(
        'ngdpbase.page.provider.filesystem.requiredpagesdir',
        './required-pages'
      ) as string;
      const requiredDir = path.isAbsolute(requiredDirRaw)
        ? requiredDirRaw
        : path.join(process.cwd(), requiredDirRaw);

      if (!(await fse.pathExists(requiredDir))) return;

      // github-only pages live in the source tree by design and are never
      // seeded, so their absence is correct rather than a defect.
      const systemCategories = configManager.getProperty('ngdpbase.system-category', {}) as
        Record<string, { storageLocation?: string }>;
      const githubOnlyCategories = new Set(
        Object.entries(systemCategories)
          .filter(([, cfg]) => cfg.storageLocation === 'github')
          .map(([key]) => key)
      );

      const files: string[] = (await fse.readdir(requiredDir)).filter((f: string) => f.endsWith('.md'));
      const missing: string[] = [];

      for (const file of files) {
        if (await fse.pathExists(path.join(pagesDirResolved, file))) continue;

        const raw: string = await fse.readFile(path.join(requiredDir, file), 'utf8');
        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        const category = parsed.data['system-category'] as string | undefined;
        if (category && githubOnlyCategories.has(category)) continue;

        const title = typeof parsed.data['title'] === 'string' ? parsed.data['title'] : file;
        missing.push(title);
      }

      if (missing.length === 0) {
        logger.debug('[PageManager] Required-pages integrity check passed');
        return;
      }

      logger.warn(
        `[PageManager] ${missing.length} required page(s) missing from storage: ${missing.join(', ')}. ` +
        'They are NOT re-seeded automatically — use the admin Required Pages Sync tool to restore ' +
        'any that were removed by accident (#954).'
      );

      try {
        const notificationManager = this.engine.getManager<NotificationManager>('NotificationManager');
        await notificationManager?.createNotification?.({
          type: 'system',
          level: 'warning',
          title: 'Required pages missing',
          message:
            `${missing.length} required page${missing.length === 1 ? '' : 's'} ` +
            `${missing.length === 1 ? 'is' : 'are'} missing from storage: ${missing.join(', ')}. ` +
            'Restore from Admin → Required Pages Sync if this was not intentional.'
        });
      } catch {
        // non-fatal
      }
    } catch (err) {
      logger.error('[PageManager] Required-pages integrity check failed:', err);
    }
  }

  /**
   * Get provider information
   * @private
   */
  private getProviderInfo(): ProviderInfo {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    if (this.provider.getProviderInfo) {
      return this.provider.getProviderInfo();
    }
    return {
      name: 'UnknownProvider',
      version: '1.0.0'
    };
  }

  /**
   * Normalize provider name from configuration (lowercase) to class name (PascalCase)
   * @param {string} providerName - Provider name from configuration (e.g., 'filesystemprovider')
   * @returns {string} Normalized class name (e.g., 'FileSystemProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      filesystemprovider: 'FileSystemProvider',
      versioningfileprovider: 'VersioningFileProvider',
      databaseprovider: 'DatabaseProvider',
      databasepageprovider: 'DatabasePageProvider',
      s3provider: 'S3Provider',
      s3pageprovider: 'S3PageProvider',
      cloudstorageprovider: 'CloudStorageProvider'
    };

    if (knownProviders[lower]) {
      return knownProviders[lower];
    }

    // Fallback: Split on common separators and capitalize each word
    const words = lower.split(/[-_]/);
    const pascalCase = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');

    return pascalCase;
  }

  /**
   * Get the current page provider instance
   *
   * @returns {PageProvider} The active provider instance
   *
   * @example
   * const provider = pageManager.getCurrentPageProvider();
   * const info = provider.getProviderInfo();
   * console.log('Using:', info.name);
   */
  getCurrentPageProvider(): PageProvider | null {
    return this.provider;
  }

  getPageUUID(identifier: string): string | null {
    return this.provider?.getPageUUID?.(identifier) ?? null;
  }

  invalidatePageCache(identifier: string): void {
    const resolvedTitle = this.provider?.invalidatePageCache?.(identifier) ?? null;
    const renderingManager = this.engine.getManager<{ invalidateHandlerCache(): void }>('RenderingManager');
    if (renderingManager) {
      renderingManager.invalidateHandlerCache();
    }
    if (resolvedTitle) {
      const uuid = this.provider?.getPageUUID?.(resolvedTitle) ?? resolvedTitle;
      const cacheManager = this.engine.getManager<{ clear(region: string | undefined, pattern?: string): Promise<void> }>('CacheManager');
      if (cacheManager) {
        cacheManager.clear(undefined, `rendered-pages:${uuid}:*`).catch(() => {});
      }
    }
  }

  // ============================================================================
  // Proxy Methods - All page operations are delegated to the provider
  // ============================================================================

  /**
   * Get complete page with content and metadata
   *
   * Retrieves a page by UUID, title, or slug. Returns the full page object
   * including content, metadata, and file path information.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<WikiPage|null>} Page object or null if not found
   *
   * @example
   * const page = await pageManager.getPage('Main');
   * console.log(page.title, page.metadata.author);
   */
  async getPage(identifier: string): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPage(identifier);
  }

  /**
   * Get only page content (without metadata)
   *
   * More efficient than getPage() when only content is needed.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<string>} Markdown content
   *
   * @example
   * const content = await pageManager.getPageContent('Main');
   * console.log(content);
   */
  async getPageContent(identifier: string): Promise<string> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageContent(identifier);
  }

  /**
   * Get only page metadata (without content)
   *
   * More efficient than getPage() when only metadata is needed.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<PageFrontmatter|null>} Metadata object or null if not found
   *
   * @example
   * const meta = await pageManager.getPageMetadata('Main');
   * console.log('Author:', meta.author);
   */
  /**
   * #915: map of canonical keyword value → registry display title, from the
   * user-keywords catalog. Used to snap page keywords to the vocabulary's
   * display form on save. Best-effort — empty map when CatalogManager is
   * unavailable, so dedup still runs (just without title-snapping).
   */
  private async getUserKeywordCanonicalMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const cm = this.engine.getManager<CatalogManager>('CatalogManager') as {
        getProviderTerms?: (domain: string) => Promise<Array<{ term: string; label?: string }>>;
      } | undefined;
      if (!cm?.getProviderTerms) return map;
      const terms = await cm.getProviderTerms('user-keywords');
      for (const t of terms) {
        const title = t.label ?? t.term;
        const value = normalizeKeywordValue(title);
        if (value && !map.has(value)) map.set(value, title);
      }
    } catch (err) {
      logger.warn('[PageManager] getUserKeywordCanonicalMap failed:', err);
    }
    return map;
  }

  async getPageMetadata(identifier: string): Promise<PageFrontmatter | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageMetadata(identifier);
  }

  /**
   * Read the literal raw file content for a page — frontmatter YAML + body
   * markdown together, exactly as it appears on disk. Backs the admin
   * "Edit raw" UI (#689); intended for recovery of pages whose frontmatter
   * the normal getPage() path sanitises or normalises away. Returns null
   * when the page is unknown or the provider doesn't support raw reads.
   */
  async getRawPageContent(identifier: string): Promise<{ filePath: string; content: string } | null> {
    const provider = this.provider as PageProvider & {
      getRawFile?: (id: string) => Promise<{ filePath: string; content: string } | null>;
    } | null;
    if (!provider?.getRawFile) return null;
    return provider.getRawFile(identifier);
  }

  /**
   * Admin-override save (#689): parse the raw file content (frontmatter +
   * body) with gray-matter and persist via provider.savePage, bypassing
   * ValidationManager.sanitizeMetadata and checkConflicts entirely. Used
   * by the admin "Edit raw" UI to fix pages where those gates would block
   * the very edit being attempted (corrupted YAML, duplicate-slug repairs,
   * etc.). The admin's identity does NOT propagate to the `editor` /
   * `lastModifiedBy` fields — that's audit-log territory (recorded by the
   * route handler, not here). The textarea is the source of truth.
   *
   * Versioning, indexing, and cache invalidation still fire via
   * provider.savePage. Throws if the textarea content isn't parseable YAML.
   */
  async saveRawPageWithAdminOverride(pageName: string, rawFileContent: string): Promise<void> {
    if (!this.provider) throw new Error('PageManager: Provider not initialized');
    const parsed = matter(rawFileContent);
    const metadata = parsed.data as Partial<PageFrontmatter>;
    const content = parsed.content;
    return this.provider.savePage(pageName, content, metadata);
  }

  /**
   * Save page content and metadata using WikiContext
   *
   * Creates a new page or updates an existing one using WikiContext as the
   * single source of truth. Extracts page name, content, and author from context.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page and user info
   * @param {Partial<PageFrontmatter>} [metadata={}] - Additional frontmatter metadata
   * @returns {Promise<void>}
   *
   * @example
   * await pageManager.savePageWithContext(wikiContext, {
   *   tags: ['tutorial']
   * });
   */
  async savePageWithContext(wikiContext: WikiContext, metadata: Partial<PageFrontmatter> = {}): Promise<void> {
    if (!wikiContext) {
      throw new Error('PageManager.savePageWithContext requires a WikiContext');
    }

    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }

    const pageName = wikiContext.pageName;
    const content = wikiContext.content;

    // Reject deprecated inline ACL markup — authors must use the audience front matter field instead
    if (content && /\[\{\s*(ALLOW|DENY)\b[^}]*\}\]/i.test(content)) {
      throw new Error(
        'Inline [{ALLOW}] / [{DENY}] markup is no longer supported. ' +
        'Use the Audience field in the page editor to control access.'
      );
    }

    // author — immutable original creator, set on ALL pages, never changes.
    // Used for both attribution display and private-page ACL ownership (see ACLManager).
    // Preserve from the existing page — must never be overwritten on edit.
    // For documentation/system category pages, default to 'system' if no user is present.
    const existingPage = pageName ? await this.provider.getPage(pageName) : null;
    const originalAuthor = existingPage?.metadata?.author;

    const incomingCategory = ((metadata as Record<string, unknown>)['system-category'] as string | undefined)
      || ((existingPage?.metadata as Record<string, unknown> | undefined)?.['system-category'] as string | undefined)
      || '';
    const isSystemCategory = ['documentation', 'system'].includes(incomingCategory.toLowerCase());
    const defaultAuthor = isSystemCategory ? 'system' : 'anonymous';

    // #946: agent provenance. Two axes — creation and latest revision.
    //
    //   created-via-token  set on create only, NEVER changes. A durable fact
    //                      about the page's origin: an agent made it.
    //   via-token          reflects the LATEST write, and is CLEARED when a
    //                      human writes. Without clearing, a page a person has
    //                      since taken over would read as permanently
    //                      agent-written.
    //
    // Both are server-owned: any value supplied by the caller is discarded,
    // never merged. A provenance marker a user can forge or strip is not a
    // provenance marker. (Same rule as `addon` — see docs/planning/addons.md.)
    const viaToken = (wikiContext.userContext as { viaToken?: { name: string } } | undefined)?.viaToken;
    const existingCreatedVia = (existingPage?.metadata as Record<string, unknown> | undefined)?.['created-via-token'];

    const rawMetadata: Partial<PageFrontmatter> = {
      ...metadata,
      author: originalAuthor || wikiContext.userContext?.username || metadata.author || defaultAuthor
    };

    // Strip caller-supplied provenance before stamping our own.
    delete (rawMetadata as Record<string, unknown>)['via-token'];
    delete (rawMetadata as Record<string, unknown>)['created-via-token'];

    if (typeof existingCreatedVia === 'string' && existingCreatedVia) {
      // Immutable — carry the original creation stamp forward untouched.
      (rawMetadata as Record<string, unknown>)['created-via-token'] = existingCreatedVia;
    } else if (!existingPage && viaToken) {
      (rawMetadata as Record<string, unknown>)['created-via-token'] = viaToken.name;
    }

    if (viaToken) {
      (rawMetadata as Record<string, unknown>)['via-token'] = viaToken.name;
    }
    // else: left absent — a human wrote this revision, so any prior stamp is
    // deliberately not carried forward.

    // Determine if this is a required page by checking the system-category config.
    // Required pages (storageLocation === 'required') cannot be marked private.
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const systemCategoriesConfig = (configManager
      ? configManager.getProperty('ngdpbase.system-category', {}) as Record<string, { label?: string; storageLocation?: string }>
      : {}) as Record<string, { label?: string; storageLocation?: string }>;
    const pageSystemCategory = ((rawMetadata as Record<string, unknown>)['system-category'] as string | undefined)
      || ((existingPage?.metadata as Record<string, unknown> | undefined)?.['system-category'] as string | undefined)
      || '';
    const isRequiredPage = Object.values(systemCategoriesConfig).some(
      (cfg) => ((cfg.label || '').toLowerCase() === pageSystemCategory.toLowerCase() && cfg.storageLocation === 'required')
    );

    // #639 Slice E: top-level `private: true` is the canonical privacy signal.
    // The Slice B back-compat path that scanned user-keywords for 'private' (or
    // for any keyword whose vocabulary entry had storageLocation: 'private')
    // was dropped after data migration completed (Slices A–D, v3.7.0). Defensive
    // strip of any stray 'private' from user-keywords is preserved — cheap
    // insurance against external authoring tools that might still emit it.
    const userKeywords = (rawMetadata['user-keywords'] || []);
    const wantsPrivate = !isRequiredPage && (rawMetadata as Record<string, unknown>).private === true;
    const keywordsHadPrivate = userKeywords.includes('private');
    let normalizedKeywords = userKeywords.filter(kw => kw !== 'private');

    // #893 (Slice 1 of #869): vocabulary-bucket normalization on every save.
    // - Lifecycle terms leave BOTH keyword arrays and become the single-valued
    //   `status:` field. An explicit status in the incoming metadata wins;
    //   otherwise the highest state found wins (catalog `order` ascending).
    // - 'capture' is machine provenance: it moves from user-keywords into
    //   system-keywords (the automation bucket).
    // Status catalog is config-driven (`ngdpbase.status`); the trio below is
    // only the fallback when config is unavailable.
    const statusCatalog = (configManager
      ? configManager.getProperty('ngdpbase.status', null)
      : null) as Record<string, { label?: string; order?: number; enabled?: boolean }> | null;
    const _statusEntries = statusCatalog && typeof statusCatalog === 'object'
      ? Object.entries(statusCatalog as Record<string, { label?: string; order?: number; default?: boolean; enabled?: boolean }>)
        .filter(([, cfg]) => cfg.enabled !== false)
        .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
      : [];
    const LIFECYCLE_ORDER = _statusEntries.length > 0
      ? _statusEntries.map(([key, cfg]) => (cfg.label ?? key).toLowerCase())
      : ['draft', 'review', 'published'];
    const _defaultStatusEntry = _statusEntries.find(([, cfg]) => cfg.default === true);
    const DEFAULT_STATUS = _defaultStatusEntry
      ? (_defaultStatusEntry[1].label ?? _defaultStatusEntry[0]).toLowerCase()
      : LIFECYCLE_ORDER[LIFECYCLE_ORDER.length - 1];
    const rawSystemKeywords = ((rawMetadata as Record<string, unknown>)['system-keywords'] as string[] | undefined) || [];
    const foundLifecycle = [...normalizedKeywords, ...rawSystemKeywords]
      .map(kw => String(kw).toLowerCase())
      .filter(kw => LIFECYCLE_ORDER.includes(kw));
    const explicitStatus = (rawMetadata as Record<string, unknown>).status;
    const derivedStatus = typeof explicitStatus === 'string' && explicitStatus !== ''
      ? explicitStatus
      : foundLifecycle.length > 0
        ? foundLifecycle.sort((a, b) => LIFECYCLE_ORDER.indexOf(b) - LIFECYCLE_ORDER.indexOf(a))[0]
        : undefined;
    // The catalog default maps to ABSENCE — never write it to frontmatter
    // (explicit caller-provided status is kept as-is only when non-default).
    const migratedStatus = derivedStatus?.toLowerCase() === DEFAULT_STATUS ? undefined : derivedStatus;
    const keywordsHadLifecycle = normalizedKeywords.some(kw => LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    const keywordsHadCapture = normalizedKeywords.some(kw => String(kw).toLowerCase() === 'capture');
    const systemHadLifecycle = rawSystemKeywords.some(kw => LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    normalizedKeywords = normalizedKeywords.filter(kw => {
      const lower = String(kw).toLowerCase();
      return !LIFECYCLE_ORDER.includes(lower) && lower !== 'capture';
    });
    const normalizedSystemKeywords = rawSystemKeywords.filter(kw => !LIFECYCLE_ORDER.includes(String(kw).toLowerCase()));
    if (keywordsHadCapture && !normalizedSystemKeywords.some(kw => String(kw).toLowerCase() === 'capture')) {
      normalizedSystemKeywords.push('capture');
    }

    // #915 (dedup enforcement, #869): collapse case/space/accent variants of a
    // user-keyword to one entry, snapping to the registry's canonical title when
    // catalogued. Runs on every save so `Dining` and `dining` can never coexist
    // on a page, and pages converge on the catalog's display form over time.
    const keywordsBeforeDedup = normalizedKeywords;
    const canonicalByValue = await this.getUserKeywordCanonicalMap();
    normalizedKeywords = dedupeKeywords(normalizedKeywords, canonicalByValue);
    const keywordsDeduped =
      normalizedKeywords.length !== keywordsBeforeDedup.length ||
      normalizedKeywords.some((k, i) => k !== keywordsBeforeDedup[i]);

    const vocabChanged = keywordsHadLifecycle || keywordsHadCapture || systemHadLifecycle;

    // Strip the existing top-level `private` so the spread below can't carry a
    // stale value when wantsPrivate is false (e.g. unsetting on a required page).
    // Also strip any legacy `system-location` — #802 Slice 4 retired the field;
    // providers now route off `metadata.private` directly. Defensive in case a
    // caller passes the legacy field in.
    const rawMetadataCopy = { ...rawMetadata } as Record<string, unknown>;
    delete rawMetadataCopy.private;
    delete rawMetadataCopy['system-location'];
    // #893: status is re-added below from migratedStatus only — deleting here
    // keeps an explicit caller-provided default (e.g. status: published) from
    // slipping through the spread; the default state is represented by absence.
    delete rawMetadataCopy.status;

    const metadataWithLocation: Partial<PageFrontmatter> & Record<string, unknown> = {
      ...rawMetadataCopy,
      // Only override the keyword arrays if normalization actually changed them —
      // otherwise leave the fields exactly as the caller provided (including absent).
      ...(keywordsHadPrivate || keywordsHadLifecycle || keywordsHadCapture || keywordsDeduped ? { 'user-keywords': normalizedKeywords } : {}),
      ...(vocabChanged && (systemHadLifecycle || keywordsHadCapture) ? { 'system-keywords': normalizedSystemKeywords } : {}),
      ...(migratedStatus !== undefined ? { status: migratedStatus } : {}),
      ...(wantsPrivate ? { private: true } : {})
    };

    // Sanitize all string fields — trims Unicode whitespace and decodes percent-encoded
    // characters (e.g. %09 → tab) before they reach the provider (#296)
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    const enrichedMetadata = validationManager
      ? validationManager.sanitizeMetadata(metadataWithLocation as Record<string, unknown>) as Partial<PageFrontmatter>
      : metadataWithLocation;

    // Enforce uniqueness before delegating to provider — PageManager is the single
    // authority on uuid/title/slug uniqueness across the system (#510 architecture)
    if (validationManager) {
      const uuid = (enrichedMetadata as Record<string, unknown>).uuid as string | undefined ?? '';
      const slug = (enrichedMetadata as Record<string, unknown>).slug as string | undefined ?? '';
      const conflict = await validationManager.checkConflicts(uuid, pageName, slug);
      if (conflict.hasConflict) {
        throw new Error(conflict.message ?? `Page conflict: ${conflict.conflictType}`);
      }
    }

    // If the page is private and the author changed (shouldn't happen normally), move the file.
    if (wantsPrivate && originalAuthor) {
      const incomingAuthor = (enrichedMetadata as Record<string, unknown>).author as string | undefined ?? '';
      if (incomingAuthor && incomingAuthor !== originalAuthor) {
        const uuid = (enrichedMetadata as Record<string, unknown>).uuid as string | undefined ?? '';
        if (uuid) await this.provider.movePrivatePage(uuid, originalAuthor, incomingAuthor);
      }
    }

    return this.provider.savePage(pageName, content, enrichedMetadata);
  }

  /**
   * Save page content and metadata
   *
   * Creates a new page or updates an existing one. Handles UUID generation
   * for new pages and version management automatically.
   *
   * @async
   * @param {string} pageName - Page title
   * @param {string} content - Markdown content
   * @param {Partial<PageFrontmatter>} [metadata={}] - Frontmatter metadata
   * @returns {Promise<void>}
   * @deprecated Use savePageWithContext() with WikiContext instead
   *
   * @example
   * await pageManager.savePage('New Page', '# Hello World', {
   *   author: 'admin',
   *   tags: ['tutorial']
   * });
   */
  async savePage(pageName: string, content: string, metadata: Partial<PageFrontmatter> = {}): Promise<void> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    const validationManager = this.engine.getManager<ValidationManager>('ValidationManager');
    if (validationManager) {
      const uuid = (metadata as Record<string, unknown>).uuid as string ?? '';
      const slug = (metadata as Record<string, unknown>).slug as string ?? '';
      const conflict = await validationManager.checkConflicts(uuid, pageName, slug);
      if (conflict.hasConflict) {
        throw new Error(conflict.message ?? `Page conflict: ${conflict.conflictType}`);
      }
    }
    return this.provider.savePage(pageName, content, metadata);
  }

  /**
   * Delete a page using WikiContext
   *
   * Removes a page from storage using WikiContext as the single source of truth.
   * Extracts the page name from the context.
   *
   * @async
   * @param {WikiContext} wikiContext - The wiki context containing page info
   * @returns {Promise<boolean>} True if deleted, false if not found
   *
   * @example
   * const deleted = await pageManager.deletePageWithContext(wikiContext);
   * if (deleted) console.log('Page removed');
   */
  async deletePageWithContext(wikiContext: WikiContext): Promise<boolean> {
    if (!wikiContext) {
      throw new Error('PageManager.deletePageWithContext requires a WikiContext');
    }

    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }

    const identifier = wikiContext.pageName;
    const deletedBy = wikiContext.userContext?.username || 'anonymous';

    logger.info(`[PageManager] Deleting page: ${identifier} by user: ${deletedBy}`);

    // #947: pass the acting user through so the tombstone records who deleted
    // the page. Providers that predate soft delete ignore the extra argument.
    return this.provider.deletePage(identifier, deletedBy);
  }

  /**
   * Delete a page
   *
   * Removes a page from storage. The page can be identified by UUID, title, or slug.
   *
   * @async
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @deprecated Use deletePageWithContext() with WikiContext instead
   *
   * @example
   * const deleted = await pageManager.deletePage('Old Page');
   * if (deleted) console.log('Page removed');
   */
  async deletePage(identifier: string): Promise<boolean> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.deletePage(identifier);
  }

  /**
   * Check if page exists
   *
   * Fast existence check without loading page content.
   *
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {boolean} True if page exists
   *
   * @example
   * if (pageManager.pageExists('Main')) {
   *   console.log('Main page exists');
   * }
   */
  pageExists(identifier: string): boolean {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.pageExists(identifier);
  }

  /**
   * Get all page titles
   *
   * Returns a sorted list of all page titles in the wiki.
   *
   * @async
   * @returns {Promise<string[]>} Sorted array of page titles
   *
   * @example
   * const pages = await pageManager.getAllPages();
   * console.log('Total pages:', pages.length);
   */
  async getAllPages(): Promise<string[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getAllPages();
  }

  /**
   * Get all page titles (explicit alias for getAllPages)
   * Prefer this for new code that only needs page names.
   * Use getAllPageInfo() when you need uuid/slug/author etc.
   */
  async getAllPageNames(): Promise<string[]> {
    return this.getAllPages();
  }

  /**
   * Get a page by its UUID
   * @param {string} uuid - Page UUID
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  async getPageByUUID(uuid: string): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageByUUID(uuid);
  }

  /**
   * Get a page by its slug
   * @param {string} slug - URL-friendly slug
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  async getPageBySlug(slug: string): Promise<WikiPage | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageBySlug(slug);
  }

  /**
   * Refresh internal cache/index
   *
   * Forces the provider to rebuild its internal caches and indices.
   * Useful after external file system changes.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await pageManager.refreshPageList();
   * console.log('Page list refreshed');
   */
  /**
   * Return pages most recently modified, sorted descending by lastModified (#635).
   *
   * Delegates to the provider's in-memory state (pageIndex / pageCache) — no
   * direct disk I/O. Honors private-page visibility based on `options.principals`
   * unless `options.includeAll` is set (admin caller).
   *
   * Used by RecentChangesPlugin and any other consumer that needs a "recent edits"
   * feed. New code should prefer this over enumerating getAllPages().
   */
  async getRecentChanges(options: RecentChangesOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getRecentChanges(options);
  }

  /**
   * Every indexed page carrying an `addon` provenance stamp.
   * Used by addon orphan detection; reads the in-memory index, no disk I/O.
   * Returns [] on providers that do not maintain a page index.
   */
  getAddonSeededIndexEntries(): Array<{ uuid: string; addon: string; slug?: string; title: string }> {
    const p = this.provider as unknown as {
      getAddonSeededIndexEntries?: () => Array<{ uuid: string; addon: string; slug?: string; title: string }>;
    } | null;
    return p?.getAddonSeededIndexEntries?.() ?? [];
  }

  /**
   * Set the `addon` stamp on an existing index entry without rewriting the page.
   * Used by the boot-time back-fill. Returns false when unsupported or unchanged.
   */
  async setIndexAddon(uuid: string, addonName: string): Promise<boolean> {
    const p = this.provider as unknown as {
      setIndexAddon?: (uuid: string, addonName: string) => Promise<boolean>;
    } | null;
    return (await p?.setIndexAddon?.(uuid, addonName)) ?? false;
  }

  /**
   * Pages owned by a given user (#640).
   *
   * Authorization: callers MUST verify the requesting user is allowed to ask
   * about `username` (typically only their own username, or admin asking about
   * another). The provider does not enforce this — it filters by `author` /
   * `creator` only.
   */
  async getPagesByCreator(username: string, options: GetPagesByCreatorOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByCreator(username, options);
  }

  /**
   * Pages most recently edited by a user (#640 Phase 2).
   */
  async getPagesByEditor(username: string, options: PagesScanOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesByEditor(username, options);
  }

  /**
   * Pages whose frontmatter audience matches any of the caller's principals,
   * excluding pages the caller already owns (#640 Phase 2).
   */
  async getPagesSharedWith(principals: string[], options: PagesScanOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPagesSharedWith(principals, options);
  }

  /**
   * Private-page access check using the page-index `creator` as the
   * authoritative identity (#711).
   *
   * The Page Audience required-pages doc states: "access uses the page's
   * **creator** as recorded in the page index, not the `author` frontmatter
   * field. If the `author` field differs from the actual creator, the
   * `author` field is ignored for access control purposes."
   *
   * Page-index `creator` is sticky (`VersioningFileProvider:1394–1396`
   * preserves it across saves); frontmatter `author` is mutable. Reading
   * the sticky source prevents an admin reassigning `author` from
   * silently shifting private-page ownership.
   *
   * Returns:
   *   - `null`  — page is not private; caller should fall through to the
   *               next access tier
   *   - `true`  — page is private AND user is admin OR the page-index creator
   *   - `false` — page is private AND user is neither admin nor creator
   *
   * Used by ACLManager Tier 0 as the single source of truth for the
   * private-access decision. Existing per-route checks (
   * `WikiRoutes.checkPrivatePageAccess`, `MediaManager.checkPrivatePageAccess`
   * ) are unaffected by this commit — they continue to use their own
   * implementations until the broader access-control refactor lands as a
   * separate epic.
   */
  async checkPrivatePageAccess(wikiContext: WikiContext, pageNameOrUuid: string): Promise<boolean | null> {
    try {
      if (!this.provider) return null;

      const pageMetadata = await this.provider.getPageMetadata(pageNameOrUuid);
      if (!pageMetadata?.uuid) return null;

      const provider = this.provider as unknown as {
        pageIndex?: { pages: Record<string, { location?: string; creator?: string }> }
      };
      const pageIndex = provider.pageIndex;
      const entry = pageIndex?.pages[pageMetadata.uuid];

      // Defensive: treat the page as private if EITHER signal says so.
      const md = pageMetadata as Record<string, unknown>;
      const isPrivate = (entry?.location === 'private') || (md.private === true);
      if (!isPrivate) return null;

      const username = wikiContext.userContext?.username;
      if (!username) return false;
      if (wikiContext.hasRole?.('admin')) return true;

      // Page-index creator (sticky) — not frontmatter `author` (mutable).
      return username === entry?.creator;
    } catch {
      return null;
    }
  }

  async refreshPageList(): Promise<void> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.refreshPageList();
  }

  /**
   * Flush any pending write queues in the provider (e.g. page-index writes).
   * Call before process exit to prevent data loss on unclean shutdown.
   */
  async flushWriteQueue(): Promise<void> {
    const provider = this.provider as { flushWriteQueue?: () => Promise<void> } | null;
    if (provider?.flushWriteQueue) {
      await provider.flushWriteQueue();
    }
  }

  /**
   * Shutdown the PageManager and its provider
   *
   * Cleanly shuts down the provider, closing connections and flushing caches.
   *
   * @async
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    if (this.provider && this.provider.shutdown) {
      await this.provider.shutdown();
    }
    logger.info('PageManager shut down');
  }

  /**
   * Backup all pages through the provider
   *
   * Delegates to the provider's backup() method to serialize all page data.
   * The backup includes all page content, metadata, and directory structure.
   *
   * @returns {Promise<BackupData>} Backup data from provider
   */
  async backup(): Promise<BackupData> {
    logger.info('[PageManager] Starting backup...');

    if (!this.provider) {
      logger.warn('[PageManager] No provider available for backup');
      return {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerClass: null,
        data: null,
        note: 'No provider initialized'
      };
    }

    try {
      let providerBackup: Record<string, unknown> | null = null;
      if (this.provider.backup) {
        providerBackup = await this.provider.backup();
      }

      return {
        managerName: 'PageManager',
        timestamp: new Date().toISOString(),
        providerClass: this.providerClass,
        providerBackup: providerBackup
      };
    } catch (error) {
      logger.error('[PageManager] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore pages from backup data
   *
   * Delegates to the provider's restore() method to recreate all pages
   * from the backup data.
   *
   * @param {BackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: BackupData): Promise<void> {
    logger.info('[PageManager] Starting restore...');

    if (!backupData) {
      throw new Error('PageManager: No backup data provided for restore');
    }

    if (!this.provider) {
      throw new Error('PageManager: No provider available for restore');
    }

    // Check for provider mismatch
    if (backupData.providerClass && typeof backupData.providerClass === 'string' && backupData.providerClass !== this.providerClass) {
      logger.warn(`[PageManager] Provider mismatch: backup has ${backupData.providerClass}, current is ${this.providerClass}`);
    }

    try {
      if (backupData.providerBackup && this.provider.restore) {
        await this.provider.restore(backupData.providerBackup as Record<string, unknown>);
        logger.info('[PageManager] Restore completed successfully');
      } else {
        logger.warn('[PageManager] No provider backup data found in backup or provider does not support restore');
      }
    } catch (error) {
      logger.error('[PageManager] Restore failed:', error);
      throw error;
    }
  }
}

export default PageManager;
