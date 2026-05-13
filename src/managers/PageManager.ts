import path from 'path';
import fse from 'fs-extra';
import matter from 'gray-matter';
import BaseManager, { BackupData } from './BaseManager.js';
import logger from '../utils/logger.js';
import { WikiEngine } from '../types/WikiEngine.js';
import { PageProvider, ProviderInfo, RecentChangesOptions, RecentChangeEntry, GetPagesByCreatorOptions, PagesScanOptions } from '../types/Provider.js';
import { WikiPage, PageFrontmatter } from '../types/Page.js';
import type ConfigurationManager from './ConfigurationManager.js';
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
class PageManager extends BaseManager {
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

      // Check conditions: skip if install is already complete AND pages exist
      const installComplete: boolean = await fse.pathExists(installCompletePath);
      if (installComplete) {
        const existing: string[] = await fse.readdir(pagesDirResolved).catch(() => []);
        if (existing.filter((f: string) => f.endsWith('.md')).length > 0) {
          logger.debug('[PageManager] Required pages seed skipped — installation already complete');
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
  async getPageMetadata(identifier: string): Promise<PageFrontmatter | null> {
    if (!this.provider) {
      throw new Error('PageManager: Provider not initialized');
    }
    return this.provider.getPageMetadata(identifier);
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

    const rawMetadata: Partial<PageFrontmatter> = {
      ...metadata,
      author: originalAuthor || wikiContext.userContext?.username || metadata.author || defaultAuthor
    };

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
    const normalizedKeywords = userKeywords.filter(kw => kw !== 'private');
    const privateStorageLocation = wantsPrivate ? 'private' : undefined;

    // Strip the existing top-level `private` so the spread below can't carry a
    // stale value when wantsPrivate is false (e.g. unsetting on a required page).
    const rawMetadataCopy = { ...rawMetadata } as Record<string, unknown>;
    delete rawMetadataCopy.private;

    const metadataWithLocation: Partial<PageFrontmatter> & Record<string, unknown> = {
      ...rawMetadataCopy,
      // Only override user-keywords if we actually stripped 'private' — otherwise
      // leave the field exactly as the caller provided it (including absent).
      ...(keywordsHadPrivate ? { 'user-keywords': normalizedKeywords } : {}),
      ...(wantsPrivate ? { private: true } : {}),
      ...(privateStorageLocation ? { 'system-location': privateStorageLocation } : {})
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
    if (privateStorageLocation && originalAuthor) {
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

    // Future: Could add audit logging here using wikiContext.userContext
    logger.info(`[PageManager] Deleting page: ${identifier} by user: ${wikiContext.userContext?.username || 'anonymous'}`);

    return this.provider.deletePage(identifier);
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
