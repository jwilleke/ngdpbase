import BasePageProvider, { WikiEngine, ProviderInfo } from './BasePageProvider.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import PageNameMatcher from '../utils/PageNameMatcher.js';
import { WikiPage, PageFrontmatter, PageInfo, PageSaveOptions, PageListOptions } from '../types/index.js';
import type { RecentChangesOptions, RecentChangeEntry } from '../types/Provider.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';

/**
 * Page cache info (internal)
 */
interface PageCacheInfo {
  title: string;
  uuid: string;
  filePath: string;
  metadata: PageFrontmatter;
}

/**
 * Backup data structure
 */
interface BackupData {
  providerName: string;
  version: string;
  timestamp: string;
  encoding: string;
  pages: Array<{
    relativePath: string;
    content: string;
    size: number;
  }>;
  requiredPages: Array<{
    relativePath: string;
    content: string;
    size: number;
  }>;
  statistics: {
    totalPages: number;
    totalSize: number;
  };
}

/**
 * FileSystemProvider - Markdown file-based page storage provider
 *
 * Implements page storage using filesystem with YAML frontmatter metadata.
 * Pages are stored as .md files in configurable directories with UUID-based
 * filenames for reliable identification.
 *
 * Key features:
 * - UUID-based file naming for reliable page identity
 * - Title-based lookup with case-insensitive matching
 * - Plural name matching support (e.g., "Page" matches "Pages")
 * - Dual storage locations (regular pages and required/system pages)
 * - In-memory caching with multiple lookup indexes
 * - Gray-matter for frontmatter parsing
 * - Configurable encoding support
 *
 * Configuration keys (all lowercase):
 * - ngdpbase.page.provider.filesystem.storagedir - Main pages directory
 * - ngdpbase.page.provider.filesystem.requiredpagesdir - Required pages directory
 * - ngdpbase.page.provider.filesystem.encoding - File encoding (default: utf-8)
 * - ngdpbase.translator-reader.match-english-plurals - Enable plural matching
 *
 * @class FileSystemProvider
 * @extends BasePageProvider
 *
 * @see {@link BasePageProvider} for base interface
 * @see {@link PageManager} for usage
 */
class FileSystemProvider extends BasePageProvider {
  /** Path to regular pages directory */
  protected pagesDirectory: string | null;

  /** Path to required pages directory */
  protected requiredPagesDirectory: string | null;

  /** File encoding */
  protected encoding: BufferEncoding;

  /** Main page cache (keyed by title) */
  protected pageCache: Map<string, PageCacheInfo>;

  /** Title index (lowercase title -> canonical title) */
  protected titleIndex: Map<string, string>;

  /** UUID index (UUID -> canonical title) */
  protected uuidIndex: Map<string, string>;

  /** Slug index (slug -> canonical title) */
  protected slugIndex: Map<string, string>;

  /** Page name matcher for fuzzy/plural matching */
  protected pageNameMatcher: PageNameMatcher | null;

  /** Content cache (title -> parsed content without frontmatter) */
  protected contentCache: Map<string, string>;

  /** Whether installation is complete (required-pages should not be used after install) */
  public installationComplete: boolean;

  /**
   * Creates a new FileSystemProvider instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
    this.pagesDirectory = null;
    this.requiredPagesDirectory = null;
    this.installationComplete = false; // Will be set during initialize()
    this.encoding = 'utf-8';
    this.pageCache = new Map();
    this.titleIndex = new Map();
    this.uuidIndex = new Map();
    this.slugIndex = new Map();
    this.contentCache = new Map();
    this.pageNameMatcher = null;
  }

  /**
   * Initialize the provider by reading configuration and caching pages
   *
   * Loads all pages from both directories into memory for fast lookup.
   * All configuration access goes through ConfigurationManager (ALL LOWERCASE).
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileSystemProvider requires ConfigurationManager');
    }

    // Get directory configuration (ALL LOWERCASE with provider-specific keys)
    // pagesDirectory uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.pagesDirectory = configManager.getResolvedDataPath(
      'ngdpbase.page.provider.filesystem.storagedir',
      './data/pages'
    );

    // requiredPagesDirectory is NOT under data folder, resolve manually
    const reqCfgPath = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.requiredpagesdir',
      './required-pages'
    ) as string;
    this.requiredPagesDirectory = path.isAbsolute(reqCfgPath) ? reqCfgPath : path.join(process.cwd(), reqCfgPath);

    // Get encoding configuration (ALL LOWERCASE)
    this.encoding = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.encoding',
      'utf-8'
    ) as BufferEncoding;

    // Initialize PageNameMatcher with plural matching and CamelCase config
    const matchEnglishPlurals = configManager.getProperty('ngdpbase.translator-reader.match-english-plurals', true) as boolean;
    const matchCamelCase = configManager.getProperty('ngdpbase.translator-reader.camel-case-links', false) as boolean;
    this.pageNameMatcher = new PageNameMatcher(matchEnglishPlurals, matchCamelCase);
    logger.info(`[FileSystemProvider] Plural matching: ${matchEnglishPlurals ? 'enabled' : 'disabled'}, CamelCase matching: ${matchCamelCase ? 'enabled' : 'disabled'}`);

    // Check installation status via .install-complete file (not config)
    const installCompleteFile = path.join(
      configManager.getInstanceDataFolder(),
      '.install-complete'
    );
    this.installationComplete = await fs.pathExists(installCompleteFile);
    logger.info(`[FileSystemProvider] Installation complete: ${this.installationComplete}`);

    // Ensure directories exist
    await fs.ensureDir(this.pagesDirectory);
    logger.info(`[FileSystemProvider] Page directory: ${this.pagesDirectory}`);

    // Only ensure required-pages directory exists if installation is NOT complete
    if (!this.installationComplete) {
      await fs.ensureDir(this.requiredPagesDirectory);
      logger.info(`[FileSystemProvider] Required-pages directory (install mode): ${this.requiredPagesDirectory}`);
    }

    // Load all pages into cache
    await this.refreshPageList();

    this.initialized = true;
    logger.info(`[FileSystemProvider] Initialized with ${this.pageCache.size} pages.`);
  }

  /**
   * Reads all .md files from the pages directory (and required-pages during installation)
   * and populates the page cache with multiple indexes.
   *
   * After installation is complete, only pages from the main pages directory are loaded.
   * The required-pages directory is only used during installation to seed the wiki.
   */
  async refreshPageList(): Promise<void> {
    this.pageCache.clear();
    this.titleIndex.clear();
    this.uuidIndex.clear();
    this.slugIndex.clear();
    this.contentCache.clear();

    if (!this.pagesDirectory || !this.requiredPagesDirectory) {
      throw new Error('FileSystemProvider not initialized - directories not set');
    }

    // Only scan required-pages during installation (before install is complete)
    const pagesFiles = await this.walkDir(this.pagesDirectory);
    let allFiles = [...pagesFiles];

    if (!this.installationComplete) {
      // During installation, also include required-pages
      const requiredFiles = await this.walkDir(this.requiredPagesDirectory);
      allFiles = [...pagesFiles, ...requiredFiles];
      logger.info(`[FileSystemProvider] Install mode: including ${requiredFiles.length} files from required-pages`);
    }

    const mdFiles = allFiles.filter(f => f.toLowerCase().endsWith('.md'));

    for (const filePath of mdFiles) {
      try {
        const fileContent = await fs.readFile(filePath, this.encoding);
        const { data, content } = matter(fileContent);
        const metadata = data as PageFrontmatter;
        // Ensure title is always a string (YAML may parse numeric titles as numbers)
        const title = metadata.title != null ? String(metadata.title).trim() : '';
        const uuid = (metadata.uuid) || path.basename(filePath, '.md');

        if (!title) {
          logger.warn(`[FileSystemProvider] Skipping file with no title in frontmatter: ${filePath}`);
          continue;
        }

        // Detect duplicate titles (first entry wins)
        const existingTitleKey = this.titleIndex.get(title.toLowerCase());
        if (existingTitleKey) {
          const existingInfo = this.pageCache.get(existingTitleKey);
          logger.warn(`[FileSystemProvider] Duplicate title "${title}" in ${path.basename(filePath)} (UUID: ${uuid}) — already indexed from ${existingInfo ? path.basename(existingInfo.filePath) : 'unknown'} (UUID: ${existingInfo?.uuid || 'unknown'}). Skipping duplicate.`);
          continue;
        }

        // Detect duplicate UUIDs (first entry wins)
        if (uuid && this.uuidIndex.has(uuid)) {
          const existingTitle = this.uuidIndex.get(uuid);
          logger.warn(`[FileSystemProvider] Duplicate UUID "${uuid}" in ${path.basename(filePath)} (title: "${title}") — already indexed for "${existingTitle}". Skipping duplicate.`);
          continue;
        }

        const pageInfo: PageCacheInfo = {
          title,
          uuid,
          filePath,
          metadata
        };

        // Use title as the canonical key for the main cache
        const canonicalKey = title;
        this.pageCache.set(canonicalKey, pageInfo);

        // Cache the content (already parsed, no extra cost)
        this.contentCache.set(canonicalKey, content);

        // Build lookup indexes
        this.titleIndex.set(title.toLowerCase(), canonicalKey);
        if (uuid) {
          this.uuidIndex.set(uuid, canonicalKey);
        }
        const slug = metadata.slug;
        if (slug) {
          this.slugIndex.set(String(slug).toLowerCase(), canonicalKey);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[FileSystemProvider] Failed to process page file: ${filePath}`, { error: errorMessage });
      }
    }
    logger.info(`[FileSystemProvider] Indexing complete. Found ${this.pageCache.size} valid pages.`);
  }

  /**
   * Recursively walk directory tree and return all file paths
   * @param {string} dir - Directory to walk
   * @returns {Promise<string[]>} Array of absolute file paths
   * @private
   */
  private async walkDir(dir: string): Promise<string[]> {
    const out: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) continue; // Skip hidden dirs
          if (entry.name === 'versions') continue; // Skip version snapshot dirs
          out.push(...(await this.walkDir(full)));
        } else if (entry.isFile()) {
          out.push(full);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[FileSystemProvider] Failed to walk directory: ${dir}`, { error: errorMessage });
    }
    return out;
  }

  /**
   * Resolve a page identifier (UUID, slug, or title) to page info
   * Tries multiple strategies:
   * 1. UUID index lookup
   * 2. Slug index lookup (URL-friendly identifiers)
   * 3. Title index (case-insensitive exact match)
   * 4. Fuzzy matching with plurals (if enabled)
   *
   * @param {string} identifier - Page UUID, slug, or title
   * @returns {PageCacheInfo|null} Page info or null if not found
   * @private
   */
  private resolvePageInfo(identifier: string): PageCacheInfo | null {
    if (!identifier || typeof identifier !== 'string') return null;

    // 1. Try UUID index first
    let canonicalKey = this.uuidIndex.get(identifier);
    if (canonicalKey) {
      return this.pageCache.get(canonicalKey) || null;
    }

    // 2. Try slug index (URL-friendly identifiers like "my-page-name")
    canonicalKey = this.slugIndex.get(identifier.toLowerCase());
    if (canonicalKey) {
      return this.pageCache.get(canonicalKey) || null;
    }

    // 3. Try title index (case-insensitive exact match)
    canonicalKey = this.titleIndex.get(identifier.toLowerCase());
    if (canonicalKey) {
      return this.pageCache.get(canonicalKey) || null;
    }

    // 4. Try fuzzy matching with plurals if enabled
    if (this.pageNameMatcher) {
      const allTitles = Array.from(this.pageCache.values()).map(info => info.title);
      const matchedTitle = this.pageNameMatcher.findMatch(identifier, allTitles);
      if (matchedTitle) {
        canonicalKey = this.titleIndex.get(matchedTitle.toLowerCase());
        if (canonicalKey) {
          logger.info(`[FileSystemProvider] Fuzzy match: '${identifier}' -> '${matchedTitle}'`);
          return this.pageCache.get(canonicalKey) || null;
        }
      }
    }

    return null; // Not found
  }

  /**
   * Get page content and metadata together
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<WikiPage|null>}
   */
  async getPage(identifier: string): Promise<WikiPage | null> {
    const info = this.resolvePageInfo(identifier);
    if (!info) {
      return null;
    }

    // Check content cache first (populated during initialization)
    const cachedContent = this.contentCache.get(info.title);
    if (cachedContent !== undefined) {
      return {
        content: cachedContent,
        metadata: info.metadata,
        title: info.title,
        uuid: info.uuid,
        filePath: info.filePath
      };
    }

    // Fallback to disk read (for pages added after initialization)
    try {
      const fullContent = await fs.readFile(info.filePath, this.encoding);
      const { content, data: metadata } = matter(fullContent);

      // Update caches for future requests — store full metadata so subsequent
      // getPage() calls (e.g. AJAX metadata requests) return complete frontmatter
      // instead of the stub { title, uuid } populated during fast-init.
      this.contentCache.set(info.title, content);
      this.pageCache.set(info.title, { ...info, metadata: metadata as PageFrontmatter });

      return {
        content,
        metadata: metadata as PageFrontmatter,
        title: info.title,
        uuid: info.uuid,
        filePath: info.filePath
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[FileSystemProvider] Failed to read page: ${identifier}`, { error: errorMessage });
      return null;
    }
  }

  /**
   * Get a page by its UUID (delegates to getPage — resolvePageInfo checks uuidIndex first)
   */
  async getPageByUUID(uuid: string): Promise<WikiPage | null> {
    return this.getPage(uuid);
  }

  /**
   * Get a page by its slug (delegates to getPage — resolvePageInfo checks slugIndex)
   */
  async getPageBySlug(slug: string): Promise<WikiPage | null> {
    return this.getPage(slug);
  }

  /**
   * Read the literal raw file content for a page — frontmatter YAML + body
   * markdown together, exactly as it appears on disk. Used by the admin
   * "Edit raw" UI (#689) to recover pages whose frontmatter is corrupted
   * in ways that the normal getPage() path sanitises or normalises away.
   * Returns null when the page is unknown (no page-index entry).
   */
  async getRawFile(identifier: string): Promise<{ filePath: string; content: string } | null> {
    const info = this.resolvePageInfo(identifier);
    if (!info) return null;
    try {
      const content = await fs.readFile(info.filePath, this.encoding);
      return { filePath: info.filePath, content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[FileSystemProvider] Failed to read raw file: ${identifier}`, { error: errorMessage });
      return null;
    }
  }

  /**
   * Retrieves the raw markdown content of a page (without frontmatter).
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<string>} The raw markdown content without frontmatter
   */
  async getPageContent(identifier: string): Promise<string> {
    const info = this.resolvePageInfo(identifier);
    if (!info) {
      logger.warn(`[FileSystemProvider] Not found: ${identifier}`);
      throw new Error(`Page '${identifier}' not found.`);
    }

    // Check content cache first
    const cachedContent = this.contentCache.get(info.title);
    if (cachedContent !== undefined) {
      logger.info(`[FileSystemProvider] Loaded ${info.title} from cache (${cachedContent.length} bytes)`);
      return cachedContent;
    }

    // Fallback to disk read
    try {
      const fullContent = await fs.readFile(info.filePath, this.encoding);
      const { content } = matter(fullContent);

      // Update cache
      this.contentCache.set(info.title, content);

      logger.info(`[FileSystemProvider] Loaded ${info.title} from ${path.basename(info.filePath)} (${content.length} bytes)`);
      return content;
    } catch (err: unknown) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        // File not found at expected path — stale cache entry (e.g. from fast init
        // using an incorrect path for a legacy page). Treat as page not found so the
        // caller can handle it gracefully rather than rendering a 500 error.
        logger.warn(`[FileSystemProvider] Page file missing (stale cache path?): ${info.title} at ${info.filePath}`);
        throw new Error(`Page '${identifier}' not found.`);
      }
      throw err;
    }
  }

  /**
   * Retrieves the metadata (frontmatter) for a given page.
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<PageFrontmatter|null>} The page metadata, or null if not found
   */
  getPageMetadata(identifier: string): Promise<PageFrontmatter | null> {
    const info = this.resolvePageInfo(identifier);
    return Promise.resolve(info ? info.metadata : null);
  }

  /**
   * Resolve the on-disk file path for a page given its uuid, location, and optional creator.
   * Private pages are stored at: {pagesDirectory}/private/{creator}/{uuid}.md
   * All other pages are stored at: {pagesDirectory}/{uuid}.md
   *
   * @param {string} uuid - Page UUID
   * @param {string} location - Storage location ('pages', 'required-pages', or 'private')
   * @param {string} [creator] - Username of the page creator (required when location === 'private')
   * @returns {string} Absolute path to the page file
   */
  private resolvePageFilePath(uuid: string, location: string, creator?: string): string {
    if (location === 'private' && creator && this.pagesDirectory) {
      return path.join(this.pagesDirectory, 'private', creator, `${uuid}.md`);
    }
    return path.join(this.pagesDirectory || '', `${uuid}.md`);
  }

  invalidatePageCache(identifier: string): string | null {
    // Resolve title from UUID, slug, or direct title lookup
    const byUuid  = this.uuidIndex.get(identifier);
    const bySlug  = this.slugIndex.get(identifier);
    // Fall back to identifier as title only if it exists in pageCache (i.e. it IS a title)
    const resolvedTitle = byUuid ?? bySlug ?? (this.pageCache.has(identifier) ? identifier : null);

    if (!resolvedTitle) return null;

    // Only evict contentCache — pageCache stores the file path and must NOT be
    // removed here. Deleting from pageCache makes resolvePageInfo() return null,
    // causing a 404 on the next request even though the file is still on disk.
    const hadEntry = this.contentCache.has(resolvedTitle);
    this.contentCache.delete(resolvedTitle);
    if (hadEntry) logger.info(`[FileSystemProvider] Evicted page cache: ${resolvedTitle}`);
    // Always return the resolved title so PageManager can clear the rendered HTML
    // cache even when contentCache was already evicted (e.g. second mutation in a row).
    return resolvedTitle;
  }

  getPageUUID(identifier: string): string | null {
    return this.resolvePageInfo(identifier)?.uuid ?? null;
  }

  async movePrivatePage(uuid: string, oldCreator: string, newCreator: string): Promise<void> {
    if (!this.pagesDirectory || oldCreator === newCreator) return;
    const fromPath = path.join(this.pagesDirectory, 'private', oldCreator, `${uuid}.md`);
    const toPath   = path.join(this.pagesDirectory, 'private', newCreator, `${uuid}.md`);
    if (await fs.pathExists(fromPath)) {
      await fs.ensureDir(path.dirname(toPath));
      await fs.move(fromPath, toPath, { overwrite: true });
      logger.info(`[FileSystemProvider] Moved private page ${uuid}: ${oldCreator} → ${newCreator}`);
    }
  }

  /**
   * Saves content to a wiki page, creating it if it doesn't exist.
   * Determines storage location based on system-category metadata.
   *
   * @param {string} pageName - The name of the page
   * @param {string} content - The new markdown content
   * @param {Partial<PageFrontmatter>} metadata - The metadata to save in the frontmatter
   * @param {PageSaveOptions} options - Save options
   * @returns {Promise<void>}
   */
  async savePage(
    pageName: string,
    content: string,
    metadata: Partial<PageFrontmatter> = {},
    options?: PageSaveOptions
  ): Promise<void> {
    const uuid = metadata.uuid || this.resolvePageInfo(pageName)?.uuid || uuidv4();

    if (!this.pagesDirectory || !this.requiredPagesDirectory) {
      throw new Error('FileSystemProvider not initialized - directories not set');
    }

    // Determine storage location to check for github-only pages
    const systemCategory = String(metadata['system-category'] ?? 'general');

    // Get storage location from ValidationManager (if available)
    interface ValidationManagerType { getCategoryStorageLocation(category: string): string }
    const validationManager = this.engine.getManager<ValidationManagerType>('ValidationManager');
    const storageLocation = validationManager?.getCategoryStorageLocation(systemCategory) ?? 'regular';

    // Handle github storage location - these pages should not be saved to wiki
    if (storageLocation === 'github') {
      throw new Error(`Cannot save page with system-category '${systemCategory}' - pages with storageLocation 'github' are not stored in the wiki (docs/ folder only)`);
    }

    // Resolve file path — private pages go to pagesDirectory/private/{creator}/{uuid}.md
    //
    // #802 Slice 3: route off `metadata.private === true` (canonical semantic
    // flag); `system-location === 'private'` is kept as a back-compat read
    // fallback for pre-migration data still on disk. Slice 4 will drop the
    // fallback after the second migration pass strips `system-location` from
    // every page's frontmatter.
    const md = metadata as Record<string, unknown>;
    const isPrivate = md.private === true || md['system-location'] === 'private';
    const pageCreator = md.author as string | undefined;
    const filePath = this.resolvePageFilePath(uuid, isPrivate ? 'private' : 'pages', pageCreator);
    await fs.ensureDir(path.dirname(filePath));

    const oldPageInfo = this.resolvePageInfo(pageName);

    const now = (options?.preserveLastModified && metadata.lastModified)
      ? metadata.lastModified
      : new Date().toISOString();
    // Use metadata.title if provided (for renames), otherwise use pageName
    const finalTitle = metadata.title || pageName;

    // Check for duplicate title (different page already has this title)
    if (this.titleExistsForDifferentPage(finalTitle, uuid)) {
      const conflictKey = this.titleIndex.get(finalTitle.toLowerCase());
      const conflictInfo = conflictKey ? this.pageCache.get(conflictKey) : null;
      throw new Error(`Title "${finalTitle}" is already in use by page ${conflictInfo?.uuid || 'unknown'}`);
    }

    // Check for duplicate UUID (different page already has this UUID)
    // Use the old title (from oldPageInfo) for exclusion since on rename the UUID
    // is still mapped to the old title in the index
    const existingTitleForUuid = oldPageInfo?.title || finalTitle;
    if (this.uuidExistsForDifferentPage(uuid, existingTitleForUuid)) {
      const conflictTitle = this.uuidIndex.get(uuid);
      throw new Error(`UUID "${uuid}" is already assigned to page "${conflictTitle || 'unknown'}"`);
    }
    // `created` (#754): set once on first save, preserved on every update.
    // Priority: explicit metadata.created (migration) > existing frontmatter `created` > now.
    // `metadata.created` is undefined for normal user saves (PageManager doesn't pass it),
    // so existing pages naturally fall through to the on-disk value.
    const existingCreated = oldPageInfo?.metadata?.created;
    const created = metadata.created ?? existingCreated ?? now;

    const updatedMetadata: Partial<PageFrontmatter> = {
      ...metadata,
      title: finalTitle, // Ensure title is set after spread
      uuid: uuid,
      lastModified: now,
      created
    };

    const fileContent = matter.stringify(content, updatedMetadata);
    await fs.writeFile(filePath, fileContent, this.encoding);

    // Handle title change: remove old cache entries
    const titleChanged = oldPageInfo && oldPageInfo.title !== finalTitle;
    if (titleChanged) {
      // Remove old title from cache and indexes
      const oldTitleStr = String(oldPageInfo.title);
      this.pageCache.delete(oldTitleStr);
      this.titleIndex.delete(oldTitleStr.toLowerCase());
      // Remove old slug from index if it existed
      const oldSlug = oldPageInfo.metadata?.slug;
      if (oldSlug) {
        this.slugIndex.delete(String(oldSlug).toLowerCase());
      }
      logger.info(`[FileSystemProvider] Page renamed from '${oldPageInfo.title}' to '${finalTitle}'`);
    }

    // Update cache with NEW title as the key
    const pageInfo: PageCacheInfo = {
      title: finalTitle,
      uuid,
      filePath,
      metadata: updatedMetadata as PageFrontmatter
    };
    this.pageCache.set(finalTitle, pageInfo);
    this.titleIndex.set(finalTitle.toLowerCase(), finalTitle);
    this.uuidIndex.set(uuid, finalTitle);
    // Update content cache
    this.contentCache.set(finalTitle, content);
    // Remove old title from content cache if renamed
    if (titleChanged && oldPageInfo) {
      this.contentCache.delete(String(oldPageInfo.title));
    }
    // Update slug index if the page has a slug
    const newSlug = updatedMetadata.slug;
    if (newSlug) {
      this.slugIndex.set(String(newSlug).toLowerCase(), finalTitle);
    }

    logger.info(`[FileSystemProvider] Page '${finalTitle}' saved successfully to ${path.basename(filePath)}.`);
  }

  /**
   * Delete a page
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deletePage(identifier: string): Promise<boolean> {
    const info = this.resolvePageInfo(identifier);
    if (!info) {
      logger.warn(`[FileSystemProvider] Cannot delete - page not found: ${identifier}`);
      return false;
    }

    try {
      // Delete the file
      logger.debug(`[FileSystemProvider] Deleting file: ${info.filePath}`);
      await fs.unlink(info.filePath);

      // Remove from all caches and indexes
      // Ensure title is string for cache operations (YAML may have parsed as number)
      const titleStr = String(info.title);
      this.pageCache.delete(titleStr);
      this.contentCache.delete(titleStr);
      this.titleIndex.delete(titleStr.toLowerCase());
      if (info.uuid) {
        this.uuidIndex.delete(info.uuid);
      }
      // Remove slug from index if it existed
      const slug = info.metadata?.slug;
      if (slug) {
        this.slugIndex.delete(String(slug).toLowerCase());
      }

      logger.info(`[FileSystemProvider] Deleted page '${info.title}' (${info.uuid})`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      logger.error(`[FileSystemProvider] Failed to delete page: ${identifier} - ${errorMessage}`);
      if (errorStack) {
        logger.error(`[FileSystemProvider] Stack: ${errorStack}`);
      }
      return false;
    }
  }

  /**
   * Check if a page exists
   * @param {string} identifier - Page UUID or title
   * @returns {boolean}
   */
  pageExists(identifier: string): boolean {
    return !!this.resolvePageInfo(identifier);
  }

  /**
   * Check if a title is already in use by a different page.
   * Used to prevent duplicate titles on save/rename.
   *
   * @param {string} title - The title to check
   * @param {string} [excludeUuid] - UUID of the page being saved (excluded from conflict check)
   * @returns {boolean} True if another page already has this title
   */
  titleExistsForDifferentPage(title: string, excludeUuid?: string): boolean {
    const canonicalKey = this.titleIndex.get(title.toLowerCase());
    if (!canonicalKey) return false;
    const existing = this.pageCache.get(canonicalKey);
    if (!existing) return false;
    if (excludeUuid && existing.uuid === excludeUuid) return false;
    return true;
  }

  /**
   * Check if a UUID is already assigned to a different page.
   * Used to prevent duplicate UUIDs on save.
   *
   * @param {string} uuid - The UUID to check
   * @param {string} [excludeTitle] - Title of the page being saved (excluded from conflict check)
   * @returns {boolean} True if another page already has this UUID
   */
  uuidExistsForDifferentPage(uuid: string, excludeTitle?: string): boolean {
    const canonicalKey = this.uuidIndex.get(uuid);
    if (!canonicalKey) return false;
    if (excludeTitle && canonicalKey === excludeTitle) return false;
    return true;
  }

  /**
   * Returns a list of all available page titles (sorted)
   * @returns {Promise<string[]>} An array of page titles
   */
  getAllPages(): Promise<string[]> {
    return Promise.resolve(Array.from(this.pageCache.keys()).sort((a, b) => a.localeCompare(b)));
  }

  /**
   * Get all page info objects
   * @param {PageListOptions} _options - List options (unused, for future filtering)
   * @returns {Promise<PageInfo[]>} Array of page info objects
   */
  getAllPageInfo(_options?: PageListOptions): Promise<PageInfo[]> {
    const pages = Array.from(this.pageCache.values()).map(info => ({
      title: info.title,
      uuid: info.uuid,
      filePath: info.filePath,
      metadata: info.metadata
    }));

    // TODO: Apply filtering and sorting based on options
    return Promise.resolve(pages);
  }

  /**
   * Find page by various identifiers
   * @param {string} identifier - UUID, title, or slug
   * @returns {string|null} Canonical page title or null
   */
  findPage(identifier: string): string | null {
    const info = this.resolvePageInfo(identifier);
    return info ? info.title : null;
  }

  /**
   * Get provider information
   * @returns {ProviderInfo}
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'FileSystemProvider',
      version: '1.0.0',
      description: 'Markdown file storage with YAML frontmatter',
      features: [
        'uuid-indexing',
        'title-indexing',
        'plural-matching',
        'dual-storage',
        'case-insensitive-lookup'
      ]
    };
  }

  /**
   * Default recent-changes implementation: derives entries from the in-memory
   * `pageCache` + each entry's metadata. VersioningFileProvider overrides with
   * a richer pageIndex-based version that includes editor / version info.
   *
   * #635: replaces the disk-read + per-page fs.stat() the RecentChangesPlugin
   * was doing. Honors private-page visibility based on the caller's principals.
   */
  async getRecentChanges(options: RecentChangesOptions = {}): Promise<RecentChangeEntry[]> {
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 50;
    const since = options.since ? new Date(options.since) : null;
    const principals = options.principals ?? [];
    const includeAll = options.includeAll === true;

    const entries: RecentChangeEntry[] = [];
    for (const info of this.pageCache.values()) {
      const md = info.metadata ?? {} as PageFrontmatter;
      const lastModifiedRaw = (md as { lastModified?: string }).lastModified
        ?? (md as { 'last-modified'?: string })['last-modified']
        ?? '';
      if (!lastModifiedRaw) continue;
      if (since && new Date(lastModifiedRaw) < since) continue;

      // #635: visibility filter — match search-provider semantics.
      // #639 Slice E: top-level `private: true` is canonical; system-location
      // is a defensive storage hint. User-keywords back-compat fallback dropped
      // post-migration.
      const isPrivate = (md as { private?: boolean }).private === true
        || (md as { 'system-location'?: string })['system-location'] === 'private';

      if (!includeAll && isPrivate) {
        const creator = (md as { creator?: string }).creator
          ?? (md as { author?: string }).author;
        const audienceRaw = (md as { audience?: unknown }).audience;
        const audience = Array.isArray(audienceRaw) ? audienceRaw.map(String) : [];
        const inAudience = audience.length > 0 && principals.some(p => audience.includes(p));
        const isCreator = creator !== undefined && principals.includes(creator);
        if (!isCreator && !inAudience) continue;
      }

      entries.push({
        title: info.title,
        uuid: info.uuid,
        lastModified: lastModifiedRaw,
        author: (md as { author?: string }).author,
        editor: (md as { editor?: string }).editor,
        isPrivate: isPrivate || undefined,
        creator: (md as { creator?: string }).creator
      });
    }

    entries.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return entries.slice(0, limit);
  }

  /**
   * Pages owned by a user (#640). Base implementation: walks pageCache and
   * matches by metadata.author OR metadata.creator. VersioningFileProvider
   * overrides with the pageIndex-backed version which carries denormalised
   * fields for free.
   */
  async getPagesByCreator(
    username: string,
    options: import('../types/Provider.js').GetPagesByCreatorOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!username) return [];

    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const onlyPrivate = options.onlyPrivate === true;
    const sortBy = options.sortBy ?? 'lastModified-desc';

    const entries: RecentChangeEntry[] = [];
    for (const info of this.pageCache.values()) {
      const md = info.metadata ?? {} as PageFrontmatter;
      const author = (md as { author?: string }).author;
      const creator = (md as { creator?: string }).creator;
      if (author !== username && creator !== username) continue;

      const userKeywords = (md as { 'user-keywords'?: unknown })['user-keywords'];
      const userKeywordsArr = Array.isArray(userKeywords) ? userKeywords.map(String) : [];
      const isPrivate = (md as { private?: boolean }).private === true
        || (md as { 'system-location'?: string })['system-location'] === 'private'
        || userKeywordsArr.includes('private');
      if (onlyPrivate && !isPrivate) continue;

      const lastModified = (md as { lastModified?: string }).lastModified ?? '';
      entries.push({
        title: info.title,
        uuid: info.uuid,
        lastModified,
        author,
        editor: (md as { editor?: string }).editor,
        isPrivate: isPrivate || undefined,
        creator
      });
    }

    if (sortBy === 'title-asc') {
      entries.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      entries.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    }
    return entries.slice(0, limit);
  }

  /**
   * Pages edited by a user (#640 Phase 2). Walks pageCache, matches by
   * `metadata.editor`. VersioningFileProvider overrides with a pageIndex-
   * backed version.
   */
  async getPagesByEditor(
    username: string,
    options: import('../types/Provider.js').PagesScanOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!username) return [];
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const sortBy = options.sortBy ?? 'lastModified-desc';

    const entries: RecentChangeEntry[] = [];
    for (const info of this.pageCache.values()) {
      const md = info.metadata ?? {} as PageFrontmatter;
      if ((md as { editor?: string }).editor !== username) continue;
      const lastModified = (md as { lastModified?: string }).lastModified ?? '';
      entries.push({
        title: info.title,
        uuid: info.uuid,
        lastModified,
        author: (md as { author?: string }).author,
        editor: (md as { editor?: string }).editor,
        isPrivate: (md as { private?: boolean }).private === true || undefined,
        creator: (md as { creator?: string }).creator
      });
    }

    if (sortBy === 'title-asc') {
      entries.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      entries.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    }
    return entries.slice(0, limit);
  }

  /**
   * Pages whose frontmatter audience contains any of the given principals
   * (#640 Phase 2). Walks pageCache. Excludes pages owned by any principal.
   */
  async getPagesSharedWith(
    principals: string[],
    options: import('../types/Provider.js').PagesScanOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!principals || principals.length === 0) return [];
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const sortBy = options.sortBy ?? 'lastModified-desc';
    const principalSet = new Set(principals);

    const entries: RecentChangeEntry[] = [];
    for (const info of this.pageCache.values()) {
      const md = info.metadata ?? {} as PageFrontmatter;
      const audienceRaw = (md as { audience?: unknown }).audience;
      const audience = Array.isArray(audienceRaw) ? audienceRaw.map(String) : [];
      if (audience.length === 0) continue;
      if (!audience.some((r) => principalSet.has(r))) continue;
      const author = (md as { author?: string }).author;
      const creator = (md as { creator?: string }).creator;
      if ((author && principalSet.has(author)) || (creator && principalSet.has(creator))) continue;

      const lastModified = (md as { lastModified?: string }).lastModified ?? '';
      entries.push({
        title: info.title,
        uuid: info.uuid,
        lastModified,
        author,
        editor: (md as { editor?: string }).editor,
        isPrivate: (md as { private?: boolean }).private === true || undefined,
        creator
      });
    }

    if (sortBy === 'title-asc') {
      entries.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      entries.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    }
    return entries.slice(0, limit);
  }

  /**
   * Backup all pages to a serializable format
   *
   * Returns all page files with their content and relative paths.
   * This allows the backup to be restored to different directory locations.
   *
   * @returns {Promise<BackupData>} Backup data containing all pages
   */
  async backup(): Promise<BackupData> {
    logger.info('[FileSystemProvider] Starting backup...');

    if (!this.pagesDirectory || !this.requiredPagesDirectory) {
      throw new Error('FileSystemProvider not initialized - directories not set');
    }

    try {
      const backupData: BackupData = {
        providerName: 'FileSystemProvider',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        encoding: this.encoding,
        pages: [],
        requiredPages: [],
        statistics: {
          totalPages: 0,
          totalSize: 0
        }
      };

      // Backup regular pages
      const pagesFiles = await this.walkDir(this.pagesDirectory);
      const pagesMdFiles = pagesFiles.filter(f => f.toLowerCase().endsWith('.md'));

      for (const filePath of pagesMdFiles) {
        try {
          const content = await fs.readFile(filePath, this.encoding);
          const relativePath = path.relative(this.pagesDirectory, filePath);

          backupData.pages.push({
            relativePath: relativePath,
            content: content,
            size: Buffer.byteLength(content, this.encoding)
          });

          backupData.statistics.totalPages++;
          backupData.statistics.totalSize += Buffer.byteLength(content, this.encoding);
        } catch (error) {
          logger.error(`[FileSystemProvider] Failed to backup page: ${filePath}`, error);
        }
      }

      // Backup required pages
      const requiredFiles = await this.walkDir(this.requiredPagesDirectory);
      const requiredMdFiles = requiredFiles.filter(f => f.toLowerCase().endsWith('.md'));

      for (const filePath of requiredMdFiles) {
        try {
          const content = await fs.readFile(filePath, this.encoding);
          const relativePath = path.relative(this.requiredPagesDirectory, filePath);

          backupData.requiredPages.push({
            relativePath: relativePath,
            content: content,
            size: Buffer.byteLength(content, this.encoding)
          });

          backupData.statistics.totalPages++;
          backupData.statistics.totalSize += Buffer.byteLength(content, this.encoding);
        } catch (error) {
          logger.error(`[FileSystemProvider] Failed to backup required page: ${filePath}`, error);
        }
      }

      logger.info(`[FileSystemProvider] Backup complete: ${backupData.statistics.totalPages} pages, ${(backupData.statistics.totalSize / 1024).toFixed(2)} KB`);

      return backupData;
    } catch (error) {
      logger.error('[FileSystemProvider] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore pages from backup data
   *
   * Recreates all page files from the backup data.
   * Preserves directory structure and file content.
   *
   * @param {BackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: BackupData): Promise<void> {
    logger.info('[FileSystemProvider] Starting restore...');

    if (!backupData || !backupData.providerName) {
      throw new Error('Invalid backup data: missing provider information');
    }

    if (backupData.providerName !== 'FileSystemProvider') {
      logger.warn(`[FileSystemProvider] Backup is from different provider: ${backupData.providerName}`);
    }

    if (!this.pagesDirectory || !this.requiredPagesDirectory) {
      throw new Error('FileSystemProvider not initialized - directories not set');
    }

    try {
      let restoredCount = 0;

      // Restore regular pages
      if (backupData.pages && Array.isArray(backupData.pages)) {
        for (const page of backupData.pages) {
          try {
            const targetPath = path.join(this.pagesDirectory, page.relativePath);
            const targetDir = path.dirname(targetPath);

            // Ensure directory exists
            await fs.ensureDir(targetDir);

            // Write page file
            await fs.writeFile(targetPath, page.content, this.encoding);
            restoredCount++;
          } catch (error) {
            logger.error(`[FileSystemProvider] Failed to restore page: ${page.relativePath}`, error);
          }
        }
      }

      // Restore required pages
      if (backupData.requiredPages && Array.isArray(backupData.requiredPages)) {
        for (const page of backupData.requiredPages) {
          try {
            const targetPath = path.join(this.requiredPagesDirectory, page.relativePath);
            const targetDir = path.dirname(targetPath);

            // Ensure directory exists
            await fs.ensureDir(targetDir);

            // Write page file
            await fs.writeFile(targetPath, page.content, this.encoding);
            restoredCount++;
          } catch (error) {
            logger.error(`[FileSystemProvider] Failed to restore required page: ${page.relativePath}`, error);
          }
        }
      }

      // Refresh page cache after restore
      await this.refreshPageList();

      logger.info(`[FileSystemProvider] Restore complete: ${restoredCount} pages restored, ${this.pageCache.size} pages in cache`);
    } catch (error) {
      logger.error('[FileSystemProvider] Restore failed:', error);
      throw error;
    }
  }
}

export default FileSystemProvider;

