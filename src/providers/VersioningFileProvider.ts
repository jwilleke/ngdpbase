import FileSystemProvider from './FileSystemProvider.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import DeltaStorage, { DiffTuple } from '../utils/DeltaStorage.js';
import PageNameMatcher from '../utils/PageNameMatcher.js';
import {
  WikiPage,
  PageFrontmatter,
  VersionContent,
  VersionDiff,
  VersionHistoryEntry
} from '../types/index.js';
import { WikiEngine, ProviderInfo } from './BasePageProvider.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import type MetricsManager from '../managers/MetricsManager.js';
import type { RecentChangesOptions, RecentChangeEntry } from '../types/Provider.js';

/**
 * Page index entry structure
 */
interface PageIndexEntry {
  title: string;
  uuid: string;
  slug?: string;
  /** Actual basename of the page file on disk (e.g. "20d28d6a-....md").
   *  Stored because the uuid field may differ from the filename for legacy pages
   *  where the frontmatter uuid was set to the page title rather than a UUID. */
  filename?: string;
  currentVersion: number;
  location: 'pages' | 'required-pages' | 'private';
  /** Username that created the page; required when location === 'private' */
  creator?: string;
  lastModified: string;
  /**
   * Creation timestamp (ISO 8601). Mirrors `PageFrontmatter.created` for fast
   * index-level filtering/sorting without reading the page file. Set on initial
   * save and preserved by every subsequent save. Optional because pre-#754
   * indexes were written without it; the page-frontmatter is the source of truth.
   */
  created?: string;
  /** Username that last modified the page */
  editor: string;
  /** Username that originally created the page (from metadata.author) */
  author?: string;
  hasVersions: boolean;
  /** Roles/usernames from front matter audience or access.view — for index-level access checks */
  audienceRoles?: string[];
  /** True when the page's frontmatter has `private: true` (canonical since #639 Slice E / v3.7.0) */
  isPrivate?: boolean;
  /**
   * Name of the add-on that seeded this page, mirrored from `PageFrontmatter.addon`.
   *
   * Indexed so provenance can be queried without reading every page file — the
   * orphan detector previously narrowed candidates via
   * `searchByCategory('addon')`, which missed any seeded page carrying a
   * different `system-category` (e.g. the `forms` page declaring
   * `documentation`) and returned nothing at all when SearchManager was
   * unavailable.
   *
   * Optional because indexes written before this field exists will not have it;
   * page frontmatter remains the source of truth, and entries gain it on their
   * next save. `AddonsManager` back-fills seeded pages at boot so detection is
   * not blind on existing instances.
   */
  addon?: string;
}

/**
 * Page index structure
 */
interface PageIndex {
  version: string;
  lastUpdated: string;
  pageCount: number;
  pages: Record<string, PageIndexEntry>;
}


/**
 * Version metadata for internal use (matches manifest structure)
 */
interface InternalVersionMetadata {
  version?: number;
  dateCreated: string;
  editor: string;
  changeType: string;
  comment: string;
  contentHash: string;
  contentSize: number;
  compressed: boolean;
  isDelta: boolean;
  isCheckpoint?: boolean;
}

/**
 * Internal manifest structure
 */
interface InternalManifest {
  pageId: string;
  pageName: string;
  currentVersion: number;
  versions: InternalVersionMetadata[];
  lastModified?: string;
  editor?: string;
  author?: string;
}

/**
 * Page cache info (internal) - matches FileSystemProvider's PageCacheInfo
 */
interface PageCacheInfo {
  title: string;
  uuid: string;
  filePath: string;
  metadata: PageFrontmatter;
}

/**
 * Extended metadata with save options (internal)
 * Includes properties from both PageFrontmatter and PageSaveOptions
 */
interface ExtendedMetadata extends Partial<PageFrontmatter> {
  comment?: string;
  changeType?: 'create' | 'update' | 'minor' | 'major' | 'created' | 'updated' | 'restored';
}

/**
 * VersioningFileProvider - File-based storage with version history
 *
 * Extends FileSystemProvider to add git-style page versioning with delta storage.
 * Maintains backward compatibility - can be swapped with FileSystemProvider.
 *
 * Features:
 * - Per-page version history with delta storage (v1 = full, v2+ = diffs)
 * - Compression of old versions (gzip)
 * - Centralized page index for fast lookups (./data/page-index.json)
 * - Version metadata tracking (author, date, change type, content hash)
 * - Retention policies (maxVersions, retentionDays)
 *
 * Directory Structure:
 * ```
 * ./data/page-index.json              # Centralized index for fast lookups
 * ./pages/{uuid}.md                    # Current version of page
 * ./pages/versions/{uuid}/
 *   ├── manifest.json                  # Single source of truth for all version metadata
 *   ├── v1/content.md                  # Full content (baseline)
 *   ├── v2/content.diff                # Delta from v1
 *   └── v3/content.diff                # Delta from v2
 * ./required-pages/{uuid}.md
 * ./required-pages/versions/{uuid}/... # Same structure for system pages
 * ```
 *
 * Note: Version metadata (author, date, hash, etc.) is stored ONLY in manifest.json
 *       to avoid data inconsistency. Individual v{N}/meta.json files are no longer used.
 *
 * @extends FileSystemProvider
 */
class VersioningFileProvider extends FileSystemProvider {
  /** Path to centralized page index */
  private pageIndexPath: string | null;

  /** Maximum versions to keep per page */
  private maxVersions: number;

  /** Days to retain versions */
  private retentionDays: number;

  /** Enable gzip compression */
  private compressionEnabled: boolean;

  /** Enable delta storage (v1=full, v2+=diff) */
  private deltaStorageEnabled: boolean;

  /** Store full snapshot every N versions (performance optimization) */
  private checkpointInterval: number;

  /** Version directories (created during initialize) */
  private pagesVersionsDir: string | null;
  private requiredPagesVersionsDir: string | null;
  private privateVersionsDir: string | null;

  /** In-memory page index cache */
  protected pageIndex: PageIndex | null;

  /** Write queue to serialize page index saves and prevent race conditions */
  private pageIndexWriteQueue: Promise<void>;

  /** Version cache for performance (LRU cache) */
  private versionCache: Map<string, string>;
  private versionCacheSize: number;

  /**
   * Create a new VersioningFileProvider
   * @param engine - The WikiEngine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);

    // Versioning configuration
    this.pageIndexPath = null;
    this.maxVersions = 50;
    this.retentionDays = 365;
    this.compressionEnabled = true;
    this.deltaStorageEnabled = true;
    this.checkpointInterval = 10;

    // Version directories (created during initialize)
    this.pagesVersionsDir = null;
    this.requiredPagesVersionsDir = null;
    this.privateVersionsDir = null;

    // In-memory page index cache
    this.pageIndex = null;

    // Write queue to serialize page index saves
    this.pageIndexWriteQueue = Promise.resolve();

    // Version cache for performance (LRU cache)
    this.versionCache = new Map();
    this.versionCacheSize = 50;
  }

  /**
   * Initialize the versioning provider
   *
   * Optimized startup flow:
   * 1. Load config and check for existing page index
   * 2. If page index exists with entries, populate cache from index (fast - avoids NAS dir scan)
   * 3. If no index, fall back to parent's directory scanning
   * 4. Create version directories
   * 5. Load or create page-index.json
   *
   * @returns Promise<void>
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('VersioningFileProvider requires ConfigurationManager');
    }

    // Load versioning configuration FIRST (to get page index path)
    await this.loadVersioningConfig(configManager);

    // Check if we can use fast index-based initialization
    const canUseFastInit = await this.canUseFastInitialization();

    if (canUseFastInit) {
      // FAST PATH: Populate cache from page index (avoids slow NAS directory scanning)
      logger.info('[VersioningFileProvider] Using fast initialization from page index');
      await this.initializeFromIndex(configManager);

      // Legacy pages with non-UUID identifiers were skipped above (their actual
      // filenames can't be derived without a NAS scan). These will return 404 until
      // the page-index.json is updated the next time each page is saved.
    } else {
      // SLOW PATH: Fall back to parent's directory scanning
      logger.info('[VersioningFileProvider] Using standard initialization (directory scan)');
      await super.initialize();

    }

    // Create version directories
    await this.createVersionDirectories();

    // Load or create page index (if not already loaded via fast init)
    if (!this.pageIndex) {
      await this.loadOrCreatePageIndex();
    }

    logger.info('[VersioningFileProvider] Initialized with versioning enabled');
    logger.info(`[VersioningFileProvider] Delta storage: ${this.deltaStorageEnabled ? 'enabled' : 'disabled'}`);
    logger.info(`[VersioningFileProvider] Compression: ${this.compressionEnabled ? 'enabled' : 'disabled'}`);
    logger.info(`[VersioningFileProvider] Max versions: ${this.maxVersions}, Retention: ${this.retentionDays} days`);
  }

  /**
   * Check if fast index-based initialization is possible
   * @returns true if page index exists, has entries, and has valid UUIDs
   */
  private async canUseFastInitialization(): Promise<boolean> {
    if (!this.pageIndexPath) {
      return false;
    }

    try {
      if (!await fs.pathExists(this.pageIndexPath)) {
        return false;
      }

      const indexData = await fs.readFile(this.pageIndexPath, 'utf8');
      const index = JSON.parse(indexData) as PageIndex;

      // Only use fast init if index has pages
      if (index.pageCount === 0) {
        return false;
      }

      // Validate that the index has at least some UUID-format entries.
      // A valid UUID looks like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      // Note: some pages legitimately use non-UUID identifiers (e.g. numeric titles like "13").
      // V8 sorts integer-keyed object properties first, so sampling only the first N entries
      // would incorrectly flag a valid mixed index as stale. Instead we check whether ANY
      // entry has a proper UUID; a truly pre-UUID index would have none.
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const entries = Object.values(index.pages);
      if (entries.length > 0) {
        const hasAnyValidUuid = entries.some(e => uuidPattern.test(e.uuid));
        if (!hasAnyValidUuid) {
          logger.warn('[VersioningFileProvider] Page index has stale UUIDs, will rebuild via directory scan');
          return false;
        }
      }

      // Cache the parsed index so initializeFromIndex doesn't need to re-read the file
      this.pageIndex = index;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize from page index (fast path - avoids directory scanning)
   * Populates caches directly from index entries by reading page files
   */
  private async initializeFromIndex(configManager: ConfigurationManager): Promise<void> {
    const startTime = Date.now();

    // Set up directories (same as parent, but without calling refreshPageList)
    this.pagesDirectory = configManager.getResolvedDataPath(
      'ngdpbase.page.provider.filesystem.storagedir',
      './data/pages'
    );

    const reqCfgPath = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.requiredpagesdir',
      './required-pages'
    ) as string;
    this.requiredPagesDirectory = path.isAbsolute(reqCfgPath)
      ? reqCfgPath
      : path.join(process.cwd(), reqCfgPath);

    this.encoding = configManager.getProperty(
      'ngdpbase.page.provider.filesystem.encoding',
      'utf-8'
    ) as BufferEncoding;

    // Initialize page name matcher
    const matchEnglishPlurals = configManager.getProperty(
      'ngdpbase.translator-reader.match-english-plurals',
      true
    ) as boolean;
    this.pageNameMatcher = new PageNameMatcher(matchEnglishPlurals);

    // Check installation status
    const installCompleteFile = path.join(
      configManager.getInstanceDataFolder(),
      '.install-complete'
    );
    this.installationComplete = await fs.pathExists(installCompleteFile);

    // Ensure directories exist
    await fs.ensureDir(this.pagesDirectory);

    // Use already-cached index from canUseFastInitialization (avoid double file read)
    if (!this.pageIndex) {
      const indexData = await fs.readFile(this.pageIndexPath!, 'utf8');
      this.pageIndex = JSON.parse(indexData) as PageIndex;
    }

    // Clear caches
    this.pageCache.clear();
    this.titleIndex.clear();
    this.uuidIndex.clear();
    this.slugIndex.clear();
    this.contentCache.clear();

    // Populate metadata caches from index only — no NAS reads.
    // Content is loaded on-demand when pages are first accessed.
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const entries = Object.values(this.pageIndex.pages);
    logger.info(`[VersioningFileProvider] Loading ${entries.length} pages from index (metadata only)...`);

    let loadedCount = 0;
    let skippedCount = 0;
    const seenTitles = new Map<string, string>(); // titleLower → uuid
    const staleUuids: string[] = [];
    for (const entry of entries) {
      const baseDir = entry.location === 'required-pages'
        ? this.requiredPagesDirectory
        : this.pagesDirectory;

      if (!baseDir) continue;

      // Determine the actual filename on disk.
      // - If the index stores an explicit filename, use it (most reliable).
      // - If uuid is a proper UUID format, the file is named {uuid}.md (correct for new pages).
      // - Otherwise the uuid is a legacy title-based identifier and the actual file is
      //   named with a proper UUID we don't know yet; skip and let the background NAS
      //   scan populate these entries with correct filePaths.
      let basename: string;
      if (entry.filename) {
        basename = entry.filename;
      } else if (uuidPattern.test(entry.uuid)) {
        basename = `${entry.uuid}.md`;
      } else {
        // Legacy page: cannot derive correct filename without NAS scan.
        // Background scan will add this to the cache when it finds the actual file.
        skippedCount++;
        continue;
      }

      // Private pages are stored under pagesDirectory/private/{creator}/
      let filePath: string;
      if (entry.location === 'private' && entry.creator) {
        filePath = path.join(baseDir, 'private', entry.creator, basename);
      } else {
        filePath = path.join(baseDir, basename);
      }
      const title = entry.title;

      // Duplicate-title detection (#587) — keep the newer entry
      const titleLower = title.toLowerCase();
      const priorUuid = seenTitles.get(titleLower);
      if (priorUuid) {
        const priorTime = new Date(this.pageIndex.pages[priorUuid]?.lastModified ?? 0).getTime();
        const thisTime  = new Date(entry.lastModified ?? 0).getTime();
        if (thisTime >= priorTime) {
          logger.warn(`[VersioningFileProvider] Duplicate title "${title}": retiring UUID ${priorUuid} in favour of ${entry.uuid}`);
          staleUuids.push(priorUuid);
          const priorTitle = this.uuidIndex.get(priorUuid);
          if (priorTitle) {
            this.pageCache.delete(priorTitle);
            this.titleIndex.delete(priorTitle.toLowerCase());
          }
          this.uuidIndex.delete(priorUuid);
          seenTitles.set(titleLower, entry.uuid);
        } else {
          logger.warn(`[VersioningFileProvider] Duplicate title "${title}": skipping UUID ${entry.uuid} (${priorUuid} is newer)`);
          staleUuids.push(entry.uuid);
          continue;
        }
      } else {
        seenTitles.set(titleLower, entry.uuid);
      }

      const pageInfo: PageCacheInfo = {
        title,
        uuid: entry.uuid,
        filePath,
        metadata: { title, uuid: entry.uuid } as PageFrontmatter
      };

      this.pageCache.set(title, pageInfo);
      this.titleIndex.set(title.toLowerCase(), title);
      this.uuidIndex.set(entry.uuid, title);

      if (entry.slug) {
        this.slugIndex.set(entry.slug.toLowerCase(), title);
      }

      loadedCount++;
    }

    // Remove stale duplicate entries and self-heal the index file (#587)
    if (staleUuids.length > 0) {
      for (const stale of staleUuids) {
        delete this.pageIndex.pages[stale];
        this.pageIndex.pageCount = Math.max(0, (this.pageIndex.pageCount ?? 1) - 1);
      }
      await this.savePageIndex();
      logger.warn(`[VersioningFileProvider] Removed ${staleUuids.length} duplicate index entr${staleUuids.length === 1 ? 'y' : 'ies'} and saved corrected index`);
    }

    // Also scan the local required-pages directory for any files not already indexed.
    // Required-pages are local (not NAS) so reading them is fast and safe regardless
    // of installationComplete status. This ensures system pages like Welcome and Footer
    // are always available even if they haven't been synced to NAS/index yet.
    if (this.requiredPagesDirectory && await fs.pathExists(this.requiredPagesDirectory)) {
      let reqFiles: string[];
      try {
        reqFiles = (await fs.readdir(this.requiredPagesDirectory))
          .filter(f => f.toLowerCase().endsWith('.md'))
          .map(f => path.join(this.requiredPagesDirectory!, f));
      } catch {
        reqFiles = [];
      }

      let reqLoaded = 0;
      for (const filePath of reqFiles) {
        const uuid = path.basename(filePath, '.md');
        if (this.uuidIndex.has(uuid)) continue; // already loaded from index

        try {
          const fileContent = await fs.readFile(filePath, this.encoding || 'utf-8');
          const parsed = matter(fileContent);
          const title = parsed.data?.title ? String(parsed.data.title) : '';
          if (!title) continue;

          if (this.titleIndex.has(title.toLowerCase())) continue; // duplicate title

          const slug = parsed.data?.slug ? String(parsed.data.slug) : undefined;
          const pageInfo: PageCacheInfo = {
            title,
            uuid,
            filePath,
            metadata: { title, uuid, ...parsed.data } as PageFrontmatter
          };

          this.pageCache.set(title, pageInfo);
          this.titleIndex.set(title.toLowerCase(), title);
          this.uuidIndex.set(uuid, title);
          if (slug) this.slugIndex.set(slug.toLowerCase(), title);
          reqLoaded++;
          loadedCount++;
        } catch {
          // skip unreadable files
        }
      }

      if (reqLoaded > 0) {
        logger.info(`[VersioningFileProvider] Loaded ${reqLoaded} additional required-pages not in index`);
      }
    }

    // Recovery scan: find UUID.md files in pagesDirectory that are missing from the index.
    // This happens when the server was killed before pending page-index writes completed.
    if (this.pagesDirectory && await fs.pathExists(this.pagesDirectory)) {
      try {
        const dirFiles = await fs.readdir(this.pagesDirectory);
        const missingFiles = dirFiles.filter((f: string) => {
          if (!f.toLowerCase().endsWith('.md')) return false;
          const uuid = f.slice(0, -3);
          return uuidPattern.test(uuid) && !this.uuidIndex.has(uuid);
        });

        if (missingFiles.length > 0) {
          logger.warn(`[VersioningFileProvider] Found ${missingFiles.length} page(s) on disk missing from index — recovering (likely from unclean shutdown)`);
          let recoveredCount = 0;
          for (const filename of missingFiles) {
            const filePath = path.join(this.pagesDirectory, filename);
            try {
              const fileContent = await fs.readFile(filePath, this.encoding || 'utf-8');
              const parsed = matter(fileContent);
              const title = parsed.data?.title ? String(parsed.data.title) : '';
              if (!title) continue;
              if (this.titleIndex.has(title.toLowerCase())) continue;
              const uuid = path.basename(filename, '.md');
              const slug = parsed.data?.slug ? String(parsed.data.slug) : undefined;
              const pageInfo: PageCacheInfo = {
                title,
                uuid,
                filePath,
                metadata: { title, uuid, ...parsed.data } as PageFrontmatter
              };
              this.pageCache.set(title, pageInfo);
              this.titleIndex.set(title.toLowerCase(), title);
              this.uuidIndex.set(uuid, title);
              if (slug) this.slugIndex.set(slug.toLowerCase(), title);
              loadedCount++;
              recoveredCount++;
            } catch {
              // skip unreadable files
            }
          }
          if (recoveredCount > 0) {
            logger.warn(`[VersioningFileProvider] Recovered ${recoveredCount} page(s) into cache. Page index will be updated on next save, or run Admin → Reindex.`);
          }
        }
      } catch (err) {
        logger.warn('[VersioningFileProvider] Failed to scan pagesDirectory for missing pages:', err);
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[VersioningFileProvider] Fast init complete: ${loadedCount} pages in ${elapsed}ms (${skippedCount} legacy pages deferred to background scan)`);

    this.initialized = true;
  }

  /**
   * Load versioning configuration from ConfigurationManager
   * @param configManager - ConfigurationManager instance
   */
  private loadVersioningConfig(configManager: ConfigurationManager): Promise<void> {
    // Page index location - uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.pageIndexPath = configManager.getResolvedDataPath(
      'ngdpbase.page.provider.versioning.indexfile',
      './data/page-index.json'
    );

    // Version retention settings
    this.maxVersions = configManager.getProperty(
      'ngdpbase.page.provider.versioning.maxversions',
      50
    ) as number;

    this.retentionDays = configManager.getProperty(
      'ngdpbase.page.provider.versioning.retentiondays',
      365
    ) as number;

    // Storage optimization settings
    const compressionSetting = configManager.getProperty(
      'ngdpbase.page.provider.versioning.compression',
      'gzip'
    ) as string;
    this.compressionEnabled = compressionSetting === 'gzip';

    this.deltaStorageEnabled = configManager.getProperty(
      'ngdpbase.page.provider.versioning.deltastorage',
      true
    ) as boolean;

    // Performance optimization settings
    this.checkpointInterval = configManager.getProperty(
      'ngdpbase.page.provider.versioning.checkpointinterval',
      10
    ) as number;

    this.versionCacheSize = configManager.getProperty(
      'ngdpbase.page.provider.versioning.cachesize',
      50
    ) as number;

    // Validate configuration
    if (this.maxVersions < 1) {
      logger.warn('[VersioningFileProvider] Invalid maxVersions, using default: 50');
      this.maxVersions = 50;
    }

    if (this.retentionDays < 1) {
      logger.warn('[VersioningFileProvider] Invalid retentionDays, using default: 365');
      this.retentionDays = 365;
    }

    if (this.checkpointInterval < 5) {
      logger.warn('[VersioningFileProvider] Invalid checkpointInterval, using default: 10');
      this.checkpointInterval = 10;
    }

    return Promise.resolve();
  }

  /**
   * Create version directories if they don't exist
   */
  private async createVersionDirectories(): Promise<void> {
    if (!this.pagesDirectory || !this.requiredPagesDirectory) {
      throw new Error('FileSystemProvider not initialized - directories not set');
    }

    // Create versions subdirectory under pages
    this.pagesVersionsDir = path.join(this.pagesDirectory, 'versions');
    await fs.ensureDir(this.pagesVersionsDir);

    // Create versions subdirectory under required-pages
    this.requiredPagesVersionsDir = path.join(this.requiredPagesDirectory, 'versions');
    await fs.ensureDir(this.requiredPagesVersionsDir);

    // Create private versions subdirectory (no creator in path — UUID is unique)
    this.privateVersionsDir = path.join(this.pagesVersionsDir, 'private');
    await fs.ensureDir(this.privateVersionsDir);

    // Create data directory for page index
    if (this.pageIndexPath) {
      const dataDir = path.dirname(this.pageIndexPath);
      await fs.ensureDir(dataDir);
    }

    logger.info('[VersioningFileProvider] Version directories created');
    logger.info(`[VersioningFileProvider]   - ${this.pagesVersionsDir}`);
    logger.info(`[VersioningFileProvider]   - ${this.requiredPagesVersionsDir}`);
    logger.info(`[VersioningFileProvider]   - ${this.privateVersionsDir}`);

    return Promise.resolve();
  }

  /**
   * Load existing page index or create new one
   * If index is empty but pages exist, auto-migrate them
   */
  private async loadOrCreatePageIndex(): Promise<void> {
    if (!this.pageIndexPath) {
      throw new Error('Page index path not set');
    }

    if (await fs.pathExists(this.pageIndexPath)) {
      try {
        const indexData = await fs.readFile(this.pageIndexPath, 'utf8');
        this.pageIndex = JSON.parse(indexData) as PageIndex;
        logger.info(`[VersioningFileProvider] Loaded page index: ${this.pageIndex?.pageCount} pages`);
        await this.migratePageIndexEntries();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('[VersioningFileProvider] Failed to load page index, creating new:', errorMessage);
        await this.createEmptyPageIndex();
      }
    } else {
      logger.info('[VersioningFileProvider] No page index found, creating new');
      await this.createEmptyPageIndex();
    }

    // Auto-migrate if index is empty but pages exist
    if (this.pageIndex && this.pageIndex.pageCount === 0 && this.pageCache && this.pageCache.size > 0) {
      logger.info(`[VersioningFileProvider] Auto-migrating ${this.pageCache.size} existing pages...`);
      await this.autoMigrateExistingPages();

      // If still empty after migration, rebuild index from existing manifests
      if (this.pageIndex.pageCount === 0) {
        logger.info('[VersioningFileProvider] Rebuilding page index from existing version manifests...');
        await this.rebuildPageIndexFromManifests();
      }
    }
  }

  /**
   * Create empty page index structure
   */
  private createEmptyPageIndex(): Promise<void> {
    this.pageIndex = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      pageCount: 0,
      pages: {}
    };
    return this.savePageIndex();
  }

  /**
   * Migrate existing page index entries to add missing location and creator fields.
   * Runs once on first boot after upgrade; subsequent boots are a no-op.
   */
  private async migratePageIndexEntries(): Promise<void> {
    if (!this.pageIndex) return;
    let migrated = 0;
    for (const entry of Object.values(this.pageIndex.pages)) {
      if (!entry.location) {
        entry.location = 'pages';
        migrated++;
      }
      if (!entry.creator) {
        entry.creator = entry.location === 'required-pages' ? 'system' : 'jim';
        migrated++;
      }
    }
    if (migrated > 0) {
      logger.info(`[VersioningFileProvider] Migrated ${migrated} index entries (added location/creator)`);
      await this.savePageIndex();
    }
  }

  /**
   * Await any pending page-index writes. Call before process exit to prevent data loss.
   */
  async flushWriteQueue(): Promise<void> {
    await this.pageIndexWriteQueue;
  }

  /**
   * Recent-changes implementation backed by the in-memory pageIndex (#635).
   *
   * Overrides FileSystemProvider's pageCache-based version with a richer one
   * that includes editor / currentVersion / hasVersions — fields the
   * RecentChangesPlugin's "full" format needs. Same visibility rules.
   */
  /**
   * Every indexed page carrying an `addon` provenance stamp.
   *
   * Reads the in-memory page index — no disk I/O and no dependency on
   * SearchManager. That matters: the orphan detector used to narrow candidates
   * with `searchByCategory('addon')`, which both missed seeded pages carrying a
   * different `system-category` and returned nothing at all when search was
   * unavailable.
   *
   * Entries written before `addon` was indexed simply will not appear;
   * `AddonsManager` back-fills seeded pages at boot.
   */
  getAddonSeededIndexEntries(): Array<{ uuid: string; addon: string; slug?: string; title: string }> {
    if (!this.pageIndex) return [];
    const out: Array<{ uuid: string; addon: string; slug?: string; title: string }> = [];
    for (const entry of Object.values(this.pageIndex.pages)) {
      if (typeof entry.addon === 'string' && entry.addon.length > 0) {
        out.push({ uuid: entry.uuid, addon: entry.addon, slug: entry.slug, title: entry.title });
      }
    }
    return out;
  }

  /**
   * Set the `addon` stamp on an existing index entry without rewriting the page.
   * Used by the boot-time back-fill so detection works on instances whose pages
   * were seeded before the field existed.
   *
   * Returns true when the entry was found and changed.
   */
  async setIndexAddon(uuid: string, addonName: string): Promise<boolean> {
    if (!this.pageIndex) return false;
    const entry = this.pageIndex.pages[uuid];
    if (!entry || entry.addon === addonName) return false;
    entry.addon = addonName;
    await this.savePageIndex();
    return true;
  }

  async getRecentChanges(options: RecentChangesOptions = {}): Promise<RecentChangeEntry[]> {
    if (!this.pageIndex) {
      return [];
    }

    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 50;
    const since = options.since ? new Date(options.since) : null;
    const principals = options.principals ?? [];
    const includeAll = options.includeAll === true;

    const entries: RecentChangeEntry[] = [];
    for (const idx of Object.values(this.pageIndex.pages)) {
      if (!idx.lastModified) continue;
      if (since && new Date(idx.lastModified) < since) continue;

      // #635: visibility filter — match search-provider semantics. The pageIndex
      // already denormalizes isPrivate (from user-keywords) and audienceRoles
      // (from frontmatter audience), so this is an O(1) lookup per page.
      if (!includeAll && idx.isPrivate) {
        const audience = idx.audienceRoles ?? [];
        const isCreator = idx.creator !== undefined && principals.includes(idx.creator);
        const inAudience = audience.length > 0 && principals.some(p => audience.includes(p));
        if (!isCreator && !inAudience) continue;
      }

      entries.push({
        title: idx.title,
        uuid: idx.uuid,
        lastModified: idx.lastModified,
        author: idx.author,
        editor: idx.editor,
        currentVersion: idx.currentVersion,
        hasVersions: idx.hasVersions,
        isPrivate: idx.isPrivate || undefined,
        creator: idx.creator
      });
    }

    entries.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    return entries.slice(0, limit);
  }

  /**
   * Pages owned by a user — backed by pageIndex (#640). Match by `author`
   * (canonical) OR `creator` (denormalised for private pages, kept in lockstep
   * with author at write time per #634 audit). Visibility filter intentionally
   * skipped — caller is asking about their own pages.
   */
  async getPagesByCreator(
    username: string,
    options: import('../types/Provider.js').GetPagesByCreatorOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!this.pageIndex || !username) {
      return [];
    }

    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const onlyPrivate = options.onlyPrivate === true;
    const sortBy = options.sortBy ?? 'lastModified-desc';

    const entries: RecentChangeEntry[] = [];
    for (const idx of Object.values(this.pageIndex.pages)) {
      const matches = idx.author === username || idx.creator === username;
      if (!matches) continue;
      if (onlyPrivate && !idx.isPrivate) continue;

      entries.push({
        title: idx.title,
        uuid: idx.uuid,
        lastModified: idx.lastModified,
        author: idx.author,
        editor: idx.editor,
        currentVersion: idx.currentVersion,
        hasVersions: idx.hasVersions,
        isPrivate: idx.isPrivate || undefined,
        creator: idx.creator
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
   * Pages most recently edited by a user (#640 Phase 2). Backed by pageIndex.
   */
  async getPagesByEditor(
    username: string,
    options: import('../types/Provider.js').PagesScanOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!this.pageIndex || !username) return [];
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const sortBy = options.sortBy ?? 'lastModified-desc';

    const entries: RecentChangeEntry[] = [];
    for (const idx of Object.values(this.pageIndex.pages)) {
      if (idx.editor !== username) continue;
      entries.push({
        title: idx.title,
        uuid: idx.uuid,
        lastModified: idx.lastModified,
        author: idx.author,
        editor: idx.editor,
        currentVersion: idx.currentVersion,
        hasVersions: idx.hasVersions,
        isPrivate: idx.isPrivate || undefined,
        creator: idx.creator
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
   * (#640 Phase 2). Excludes pages owned by any of those principals — the
   * intent is "shared WITH me", not "mine via audience". Backed by
   * pageIndex.audienceRoles which is denormalised at write time.
   */
  async getPagesSharedWith(
    principals: string[],
    options: import('../types/Provider.js').PagesScanOptions = {}
  ): Promise<RecentChangeEntry[]> {
    if (!this.pageIndex || !principals || principals.length === 0) return [];
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const sortBy = options.sortBy ?? 'lastModified-desc';
    const principalSet = new Set(principals);

    const entries: RecentChangeEntry[] = [];
    for (const idx of Object.values(this.pageIndex.pages)) {
      const audience = idx.audienceRoles ?? [];
      if (audience.length === 0) continue;
      const inAudience = audience.some((r) => principalSet.has(r));
      if (!inAudience) continue;
      // Exclude pages the user already owns (avoid duplication with /my/pages).
      if ((idx.author && principalSet.has(idx.author))
        || (idx.creator && principalSet.has(idx.creator))) continue;

      entries.push({
        title: idx.title,
        uuid: idx.uuid,
        lastModified: idx.lastModified,
        author: idx.author,
        editor: idx.editor,
        currentVersion: idx.currentVersion,
        hasVersions: idx.hasVersions,
        isPrivate: idx.isPrivate || undefined,
        creator: idx.creator
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
   * Save page index to disk (atomic write, serialized via queue)
   * Uses a write queue to prevent concurrent saves from conflicting.
   */
  private savePageIndex(): Promise<void> {
    if (!this.pageIndex || !this.pageIndexPath) {
      throw new Error('Page index not initialized');
    }

    this.pageIndex.lastUpdated = new Date().toISOString();

    // Serialize writes through the queue to prevent race conditions
    const indexPath = this.pageIndexPath;
    const data = JSON.stringify(this.pageIndex, null, 2);
    const _metricsStart = Date.now();

    this.pageIndexWriteQueue = this.pageIndexWriteQueue.then(async () => {
      // Use unique temp file to prevent collisions
      const tempPath = `${indexPath}.tmp.${process.pid}.${Date.now()}`;
      try {
        await fs.writeFile(tempPath, data, 'utf8');
        await fs.rename(tempPath, indexPath);
        this.engine.getManager<MetricsManager>('MetricsManager')?.recordPageIndexSave?.(Date.now() - _metricsStart);
      } catch (err) {
        this.engine.getManager<MetricsManager>('MetricsManager')?.recordPageIndexSave?.(Date.now() - _metricsStart);
        // Clean up temp file on error
        try { await fs.unlink(tempPath); } catch { /* ignore */ }
        throw err;
      }
    });

    return this.pageIndexWriteQueue;
  }

  /**
   * Auto-migrate existing pages to versioning
   * Creates v1 for all pages that don't have versions yet
   */
  private async autoMigrateExistingPages(): Promise<void> {
    let migratedCount = 0;
    let errorCount = 0;

    for (const [, pageData] of this.pageCache.entries()) {
      // pageCache is keyed by title — use pageData.uuid for the actual UUID
      const uuid = (pageData as PageCacheInfo).uuid;
      try {
        // #806: determine location FIRST so the manifest check probes the
        // correct version tree. The original code defaulted to
        // `getVersionDirectory(uuid)` (location='pages') which never found
        // manifests for required-pages or private pages — autoMigrate would
        // then fall through to "create v1", redundantly creating spurious v1
        // files for every already-versioned page on jimstest.
        if (!this.pagesDirectory || !this.requiredPagesDirectory) {
          continue;
        }
        const pagesPath = path.join(this.pagesDirectory, `${uuid}.md`);
        const requiredPath = path.join(this.requiredPagesDirectory, `${uuid}.md`);
        const author = ((pageData as PageCacheInfo).metadata as Record<string, unknown> | undefined)?.['author'] as string | undefined;
        const privatePath = author
          ? path.join(this.pagesDirectory, 'private', author, `${uuid}.md`)
          : null;

        let location: 'pages' | 'required-pages' | 'private' = 'pages';
        let pagePath = pagesPath;
        let creator: string | undefined;

        if (await fs.pathExists(requiredPath)) {
          location = 'required-pages';
          pagePath = requiredPath;
        } else if (privatePath && await fs.pathExists(privatePath)) {
          location = 'private';
          pagePath = privatePath;
          creator = author;
        }

        // Now check if THIS LOCATION's version tree has a manifest. Pages
        // whose manifest lives in the correct tree are indexed without
        // re-creating v1.
        const versionDir = this.getVersionDirectory(uuid, location);
        const manifestPath = path.join(versionDir, 'manifest.json');

        if (await fs.pathExists(manifestPath)) {
          await this.indexExistingVersionedPage(uuid, pageData as PageCacheInfo, manifestPath);
          migratedCount++;
          continue;
        }

        // Read current page content
        let content = '';
        let metadata: Partial<PageFrontmatter> = {};

        if (await fs.pathExists(pagePath)) {
          const fileContent = await fs.readFile(pagePath, 'utf8');
          const parsed = matter(fileContent);
          content = parsed.content;
          metadata = parsed.data as PageFrontmatter;
        } else {
          // {uuid}.md not found — the page may have a slug-based filename on disk,
          // OR may live under pages/private/{author}/{uuid}.md.
          // pageCache.filePath holds the actual path discovered during directory scan.
          const actualFilePath = (pageData as PageCacheInfo).filePath;
          if (actualFilePath && await fs.pathExists(actualFilePath)) {
            // Correct location based on which directory the file actually lives in.
            // #806: also handle the private subdir so private pages don't get
            // renamed into the regular pile by the rename below.
            if (actualFilePath.startsWith(this.requiredPagesDirectory + path.sep)) {
              location = 'required-pages';
              pagePath = requiredPath;
            } else if (actualFilePath.includes(`${path.sep}private${path.sep}`)) {
              location = 'private';
              creator = author;
              pagePath = actualFilePath; // already correctly placed; don't rename
            } else {
              location = 'pages';
              pagePath = pagesPath;
            }
            const fileContent = await fs.readFile(actualFilePath, 'utf8');
            const parsed = matter(fileContent);
            content = parsed.content;
            metadata = parsed.data as PageFrontmatter;
            // Rename the slug-named file to its proper UUID filename — but
            // ONLY if pagePath actually differs (i.e. file was slug-named).
            // Private files already at private/{author}/{uuid}.md don't move.
            if (actualFilePath !== pagePath) {
              await fs.rename(actualFilePath, pagePath);
              logger.info(
                '[VersioningFileProvider] Auto-migration: renamed slug-named file ' +
                `"${path.basename(actualFilePath)}" → "${path.basename(pagePath)}" ` +
                `for page "${(pageData as PageCacheInfo).title}"`
              );
            }
          } else {
            logger.warn(
              '[VersioningFileProvider] Auto-migration: file not found for page ' +
              `"${(pageData as PageCacheInfo).title}" (uuid: ${uuid}); ` +
              `expected "${pagePath}"` +
              (actualFilePath ? `, also checked "${actualFilePath}"` : '') +
              ' — creating v1 with empty content'
            );
          }
        }

        // Create v1
        await this.createInitialVersion(uuid, (pageData as PageCacheInfo).title, content, metadata, location);

        // Update page index. #806: include slug + filename + (when private)
        // creator so slug-based URL lookups work after an auto-migration pass.
        const slugFromMeta = typeof (metadata as Record<string, unknown>)['slug'] === 'string'
          ? ((metadata as Record<string, unknown>)['slug'] as string)
          : undefined;
        const filename = path.basename(pagePath);
        await this.updatePageInIndex(uuid, {
          title:    (pageData as PageCacheInfo).title,
          uuid,
          currentVersion: 1,
          location,
          lastModified: new Date().toISOString(),
          editor: 'system',
          hasVersions: true,
          slug:     slugFromMeta,
          filename,
          ...(creator ? { creator } : {})
        });

        migratedCount++;

        if (migratedCount % 10 === 0) {
          logger.info(`[VersioningFileProvider] Migrated ${migratedCount}/${this.pageCache.size} pages...`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        logger.error(`[VersioningFileProvider] Failed to migrate page ${(pageData as PageCacheInfo).title} (${uuid}): ${errorMessage}`);
        if (errorStack) {
          logger.debug(errorStack);
        }
        errorCount++;
      }
    }

    logger.info(`[VersioningFileProvider] Auto-migration complete: ${migratedCount} pages migrated, ${errorCount} errors`);
  }

  /**
   * #806 — Index a page that already has a version manifest (no v1 creation
   * needed). Called by `autoMigrateExistingPages` when scanning a pageCache
   * entry whose manifest already exists. Pulls currentVersion/lastModified/
   * editor from the manifest, slug/filename from frontmatter + disk, and
   * detects location across `pages/`, `pages/private/{author}/`, and
   * `required-pages/`.
   */
  private async indexExistingVersionedPage(
    uuid: string,
    info: PageCacheInfo,
    manifestPath: string
  ): Promise<void> {
    if (!this.pagesDirectory || !this.requiredPagesDirectory) return;

    const md = (info.metadata ?? {}) as PageFrontmatter & Record<string, unknown>;
    const filePathFromCache = info.filePath ?? '';
    const author = typeof md['author'] === 'string' ? (md['author']) : undefined;

    let location: 'pages' | 'required-pages' | 'private';
    let creator: string | undefined;

    if (filePathFromCache.startsWith(this.requiredPagesDirectory + path.sep)) {
      location = 'required-pages';
    } else if (filePathFromCache.includes(`${path.sep}private${path.sep}`)) {
      location = 'private';
      const segments = filePathFromCache.split(path.sep);
      const privateIdx = segments.lastIndexOf('private');
      if (privateIdx >= 0 && privateIdx + 1 < segments.length - 1) {
        creator = segments[privateIdx + 1];
      }
    } else if (filePathFromCache.startsWith(this.pagesDirectory + path.sep)) {
      location = 'pages';
    } else {
      // Probe candidate locations on disk as a fallback.
      const requiredProbe = path.join(this.requiredPagesDirectory, `${uuid}.md`);
      const privateProbe = author ? path.join(this.pagesDirectory, 'private', author, `${uuid}.md`) : null;
      if (await fs.pathExists(requiredProbe)) {
        location = 'required-pages';
      } else if (privateProbe && await fs.pathExists(privateProbe)) {
        location = 'private';
        creator = author;
      } else {
        location = 'pages';
      }
    }

    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData) as InternalManifest;

    const slugFromMeta = typeof md['slug'] === 'string' ? (md['slug']) : undefined;
    const filename = filePathFromCache ? path.basename(filePathFromCache) : `${uuid}.md`;

    await this.updatePageInIndex(uuid, {
      title:    info.title,
      uuid,
      currentVersion: manifest.currentVersion ?? 1,
      location,
      lastModified: manifest.lastModified ?? (md['lastModified'] as string | undefined) ?? new Date().toISOString(),
      editor:   manifest.editor ?? manifest.author ?? (md['author']) ?? 'unknown',
      hasVersions: true,
      slug:     slugFromMeta,
      filename,
      ...(creator ? { creator } : {})
    });
  }

  /**
   * Rebuild page index from existing version manifests
   * Used when index is lost but versions exist
   */
  private async rebuildPageIndexFromManifests(): Promise<void> {
    let rebuiltCount = 0;
    let errorCount = 0;
    let manifestlessCount = 0;

    for (const [, pageData] of this.pageCache.entries()) {
      // pageCache is keyed by title — use pageData.uuid for the actual UUID
      const info = pageData as PageCacheInfo;
      const uuid = info.uuid;
      try {
        // Determine location from disk:
        //   - required-pages/{uuid}.md          → 'required-pages'
        //   - pages/private/{author}/{uuid}.md  → 'private'
        //   - pages/{uuid}.md                   → 'pages'
        // Prefer the cached filePath (set by FSP.refreshPageList during the
        // slow-path init walk). If it's not present, fall back to probing
        // candidate locations on disk so the rebuild stays correct even for
        // pages that reached pageCache through a different code path.
        if (!this.pagesDirectory || !this.requiredPagesDirectory) {
          continue;
        }

        let location: 'pages' | 'required-pages' | 'private';
        let creator: string | undefined;
        const md = (info.metadata ?? {}) as PageFrontmatter & Record<string, unknown>;
        const filePathFromCache = info.filePath ?? '';

        // Author from frontmatter — used both to compute the candidate private
        // path and as the creator value when location resolves to 'private'.
        const author = typeof md['author'] === 'string' ? (md['author']) : undefined;

        // Try cached path first.
        if (filePathFromCache.startsWith(this.requiredPagesDirectory + path.sep)
          || filePathFromCache === this.requiredPagesDirectory + path.sep + `${uuid}.md`) {
          location = 'required-pages';
        } else if (filePathFromCache.includes(`${path.sep}private${path.sep}`)) {
          location = 'private';
          const segments = filePathFromCache.split(path.sep);
          const privateIdx = segments.lastIndexOf('private');
          if (privateIdx >= 0 && privateIdx + 1 < segments.length - 1) {
            creator = segments[privateIdx + 1];
          }
        } else if (filePathFromCache.startsWith(this.pagesDirectory + path.sep)) {
          location = 'pages';
        } else {
          // No useful filePath — probe candidates on disk.
          const requiredProbe = path.join(this.requiredPagesDirectory, `${uuid}.md`);
          const privateProbe = author
            ? path.join(this.pagesDirectory, 'private', author, `${uuid}.md`)
            : null;
          if (await fs.pathExists(requiredProbe)) {
            location = 'required-pages';
          } else if (privateProbe && await fs.pathExists(privateProbe)) {
            location = 'private';
            creator = author;
          } else {
            location = 'pages';
          }
        }

        // Extract slug + filename for the index entry. The index entry shape
        // expected by initializeFromIndex includes these (#806).
        const slugFromMeta = typeof md['slug'] === 'string' ? (md['slug']) : undefined;
        const filename = filePathFromCache ? path.basename(filePathFromCache) : `${uuid}.md`;

        // Load manifest if present (gives us currentVersion + lastModified +
        // editor). If absent, the page has no version history yet — write a
        // pre-versioning entry so the page is still discoverable. Before #806
        // the manifest check was a hard gate that silently dropped every
        // pre-versioning page (~17K → 138 entries on jimstest).
        const versionDir = this.getVersionDirectory(uuid, location);
        const manifestPath = path.join(versionDir, 'manifest.json');
        const hasManifest = await fs.pathExists(manifestPath);

        let currentVersion = 1;
        let lastModified = (md['lastModified'] as string | undefined) ?? new Date().toISOString();
        let editor = (md['editor']) ?? (md['author']) ?? 'unknown';
        let hasVersions = false;

        if (hasManifest) {
          const manifestData = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestData) as InternalManifest;
          currentVersion = manifest.currentVersion ?? currentVersion;
          lastModified = manifest.lastModified ?? lastModified;
          editor = manifest.editor ?? manifest.author ?? editor;
          hasVersions = true;
        } else {
          manifestlessCount++;
        }

        await this.updatePageInIndex(uuid, {
          title:    info.title,
          uuid,
          currentVersion,
          location,
          lastModified,
          editor,
          hasVersions,
          slug:     slugFromMeta,
          filename,
          ...(creator ? { creator } : {})
        });

        rebuiltCount++;
        if (rebuiltCount % 1000 === 0) {
          logger.info(`[VersioningFileProvider] Rebuilt ${rebuiltCount}/${this.pageCache.size} index entries...`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[VersioningFileProvider] Failed to rebuild index for ${info.title} (${uuid}): ${errorMessage}`);
        errorCount++;
      }
    }

    // Sanity check: surface large divergence between rebuilt count and on-disk
    // file count so a regression in the walk path is loud.
    logger.info(`[VersioningFileProvider] Page index rebuild complete: ${rebuiltCount} entries rebuilt (${manifestlessCount} without version manifest), ${errorCount} errors`);
    if (rebuiltCount === 0 && this.pageCache.size > 0) {
      logger.error(`[VersioningFileProvider] Rebuild produced 0 entries from ${this.pageCache.size} cached pages — index will be unusable for slug/title lookups`);
    }
  }

  /**
   * Update a single page entry in the index
   * @param uuid - Page UUID
   * @param data - Page data to update
   */
  private updatePageInIndex(uuid: string, data: PageIndexEntry): Promise<void> {
    if (!this.pageIndex) {
      throw new Error('Page index not initialized');
    }

    // Remove any existing entry with the same title but a different UUID (#587)
    const incomingTitle = data.title?.toLowerCase();
    if (incomingTitle) {
      for (const [existingUuid, existingEntry] of Object.entries(this.pageIndex.pages)) {
        if (existingUuid !== uuid && existingEntry.title?.toLowerCase() === incomingTitle) {
          logger.warn(
            `[VersioningFileProvider] Removing duplicate title "${data.title}" ` +
            `(stale UUID: ${existingUuid}) — replaced by ${uuid}`
          );
          delete this.pageIndex.pages[existingUuid];
          this.pageIndex.pageCount = Math.max(0, (this.pageIndex.pageCount ?? 1) - 1);
        }
      }
    }

    if (!this.pageIndex.pages[uuid]) {
      this.pageIndex.pageCount++;
    }

    this.pageIndex.pages[uuid] = {
      ...this.pageIndex.pages[uuid],
      ...data,
      uuid: uuid
    };

    return this.savePageIndex();
  }

  /**
   * Remove a page from the page index
   * @param uuid - Page UUID
   */
  private removePageFromIndex(uuid: string): Promise<void> {
    if (!this.pageIndex) {
      throw new Error('Page index not initialized');
    }

    if (this.pageIndex.pages[uuid]) {
      delete this.pageIndex.pages[uuid];
      this.pageIndex.pageCount--;
      logger.info(`[VersioningFileProvider] Removed page ${uuid} from index`);
      return this.savePageIndex();
    }
    return Promise.resolve();
  }

  /**
   * Rename a UUID in the page index (used by adopt-UUID operations that move a file to a new UUID).
   * Updates the index entry key and uuid field, then persists the index.
   * No-op if oldUuid is not in the index.
   */
  public async renamePageInIndex(oldUuid: string, newUuid: string): Promise<void> {
    if (!this.pageIndex) return;
    const entry = this.pageIndex.pages[oldUuid];
    if (entry) {
      this.pageIndex.pages[newUuid] = { ...entry, uuid: newUuid, filename: `${newUuid}.md` };
      delete this.pageIndex.pages[oldUuid];
      logger.info(`[VersioningFileProvider] Renamed page index entry ${oldUuid} → ${newUuid}`);
      await this.savePageIndex();
    }
  }

  /**
   * Get version directory for a page
   * @param uuid - Page UUID
   * @param location - 'pages' or 'required-pages'
   * @returns Version directory path
   */
  /** Public alias for external tools (VersioningMaintenance, VersioningAnalytics) */
  public _getVersionDirectory(uuid: string, location: 'pages' | 'required-pages' | 'private' = 'pages'): string {
    return this.getVersionDirectory(uuid, location);
  }

  /** Public alias for external tools (VersioningAnalytics) */
  public _resolveIdentifier(identifier: string): Promise<{ uuid: string; location: 'pages' | 'required-pages' | 'private' } | null> {
    return this.resolveIdentifier(identifier);
  }

  private getVersionDirectory(uuid: string, location: 'pages' | 'required-pages' | 'private' = 'pages'): string {
    if (location === 'private') {
      if (!this.privateVersionsDir) {
        throw new Error('Version directories not initialized');
      }
      return path.join(this.privateVersionsDir, uuid);
    }

    const baseDir = location === 'required-pages'
      ? this.requiredPagesVersionsDir
      : this.pagesVersionsDir;

    if (!baseDir) {
      throw new Error('Version directories not initialized');
    }

    return path.join(baseDir, uuid);
  }

  // ============================================================================
  // Manifest.json Management
  // ============================================================================

  /**
   * Load manifest for a page
   * @param uuid - Page UUID
   * @param location - 'pages' or 'required-pages'
   * @returns Manifest data or null if doesn't exist
   */
  private loadManifest(uuid: string, location: 'pages' | 'required-pages' | 'private'): Promise<InternalManifest | null> {
    const versionDir = this.getVersionDirectory(uuid, location);
    const manifestPath = path.join(versionDir, 'manifest.json');

    return fs.pathExists(manifestPath).then(exists => {
      if (!exists) {
        return null;
      }

      return fs.readFile(manifestPath, 'utf8')
        .then(manifestData => JSON.parse(manifestData) as InternalManifest)
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`[VersioningFileProvider] Failed to load manifest for ${uuid}:`, errorMessage);
          return null;
        });
    });
  }

  /**
   * Save manifest for a page (atomic write)
   * @param uuid - Page UUID
   * @param location - 'pages' or 'required-pages'
   * @param manifest - Manifest data
   */
  private saveManifest(uuid: string, location: 'pages' | 'required-pages' | 'private', manifest: InternalManifest): Promise<void> {
    const versionDir = this.getVersionDirectory(uuid, location);
    const manifestPath = path.join(versionDir, 'manifest.json');

    // Atomic write
    const tempPath = `${manifestPath}.tmp`;
    return fs.ensureDir(versionDir)
      .then(() => fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf8'))
      .then(() => fs.rename(tempPath, manifestPath));
  }

  /**
   * Create initial manifest for a new page
   * @param uuid - Page UUID
   * @param pageName - Page title
   * @returns Initial manifest
   */
  private createInitialManifest(uuid: string, pageName: string): InternalManifest {
    return {
      pageId: uuid,
      pageName: pageName,
      currentVersion: 0,
      versions: []
    };
  }

  /**
   * Add version entry to manifest
   * @param manifest - Manifest object
   * @param versionData - Version metadata
   */
  private addVersionToManifest(manifest: InternalManifest, versionData: InternalVersionMetadata): void {
    manifest.currentVersion++;
    manifest.versions.push({
      version: manifest.currentVersion,
      ...versionData
    });
  }

  // ============================================================================
  // Version Creation
  // ============================================================================

  /**
   * Override savePage to create versions
   *
   * Algorithm:
   * 1. Check if page exists (new vs update)
   * 2. If update: create diff and new version
   * 3. If new: create initial version (v1 with full content)
   * 4. Update manifest.json
   * 5. Call parent savePage() for current content
   * 6. Update page-index.json
   *
   * @param pageName - Page title
   * @param content - New content
   * @param metadata - Page metadata
   * @returns Promise<void>
   */
  async savePage(pageName: string, content: string, metadata: Partial<PageFrontmatter> = {}): Promise<void> {
    // Check if page exists using public method
    const pageExists = this.pageExists(pageName);

    // Get existing page info if it exists
    let pageInfo: WikiPage | null = null;
    if (pageExists) {
      try {
        pageInfo = await this.getPage(pageName);
      } catch {
        // Page might exist but not be readable, treat as new
        pageInfo = null;
      }
    }

    // Determine UUID (existing or new)
    const uuid = pageInfo?.uuid || metadata.uuid || uuidv4();

    // Determine location:
    // 1. If page is private (`private:true` canonical signal — #802 Slice 4
    //    retired the legacy `system-location:'private'` fallback), use 'private'
    // 2. Otherwise fall back to system-category → storageLocation mapping
    const metadataRecord = metadata as Record<string, unknown>;
    const isPrivate = metadata.private === true;
    const newCreator = metadata.author || 'anonymous';

    let location: 'pages' | 'required-pages' | 'private' = 'pages';

    if (isPrivate) {
      location = 'private';
    } else {
      const systemCategory = (metadataRecord['system-category'] || metadataRecord.systemCategory || 'General') as string;
      const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
      const systemCategoriesConfig = configManager?.getProperty('ngdpbase.system-category', null) as Record<string, { label?: string; storageLocation?: string }> | null;

      if (systemCategoriesConfig) {
        for (const config of Object.values(systemCategoriesConfig)) {
          if (config.label?.toLowerCase() === systemCategory.toLowerCase()) {
            location = config.storageLocation === 'required' ? 'required-pages' : 'pages';
            break;
          }
        }
      }
    }

    // Detect location change (e.g. private → public or public → private) and move files
    const currentEntry = this.pageIndex?.pages[uuid];
    if (currentEntry && currentEntry.location !== location) {
      const currentCreator = currentEntry.creator;
      try {
        await this.movePageFile(uuid, currentEntry.location, currentCreator, location, location === 'private' ? newCreator : undefined);
        await this.moveVersionDirectory(uuid, currentEntry.location, location);
        logger.info(`[VersioningFileProvider] Moved page '${pageName}' (${uuid}) from '${currentEntry.location}' to '${location}'`);
      } catch (moveError) {
        const errorMessage = moveError instanceof Error ? moveError.message : String(moveError);
        logger.error(`[VersioningFileProvider] Failed to move page files for '${pageName}':`, errorMessage);
        // Continue to save current content even if move fails
      }
    }

    // `created` (#754): set once on initial save and preserved by every update.
    // Priority: explicit metadata.created (migration) > existing index entry > existing
    // frontmatter > now. Computed here so both the on-disk write (via super.savePage)
    // and the page-index write below use the SAME value.
    const indexCreated = currentEntry?.created;
    const frontmatterCreated = pageInfo?.metadata?.created;
    const created = metadata.created ?? indexCreated ?? frontmatterCreated ?? new Date().toISOString();

    // Call parent to save current content (uses FileSystemProvider path logic).
    // #908 B2: super.savePage() runs FileSystemProvider's UUID-uniqueness guard,
    // which THROWS if this UUID is already assigned to a different page. It must
    // run BEFORE version creation so a conflict doesn't leave an orphan version
    // artifact behind (the failure the addon-seed re-save exposed). Safe to
    // reorder: createNewVersion() diffs against the version-history dir, not the
    // {uuid}.md page file super.savePage() writes, so its baseline is unaffected.
    await super.savePage(pageName, content, { ...metadata, uuid, created });

    try {
      if (pageInfo) {
        // Existing page: create new version with diff
        await this.createNewVersion(uuid, pageName, content, metadata, location, pageInfo);
      } else {
        // New page: create initial version
        await this.createInitialVersion(uuid, pageName, content, metadata, location);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[VersioningFileProvider] Failed to create version for ${pageName}:`, errorMessage);
      // Page content is already persisted; a versioning failure is non-fatal.
    }

    // Update page index — always store filename so fast init uses the correct path
    const creator = location === 'private'
      ? (newCreator || currentEntry?.creator || 'anonymous')
      : currentEntry?.creator;
    const ar = (metadata.access as Record<string, unknown> | undefined)?.['view'] ?? metadata.audience;
    // #639 Slice E: read top-level `private: true` only; user-keywords
    // back-compat fallback dropped post-migration (Slices A–D, v3.7.0).
    const isPrivateFlag = (metadata as Record<string, unknown>).private === true;
    await this.updatePageInIndex(uuid, {
      title: (metadata.title as string) || pageName,
      uuid: uuid,
      slug: metadata.slug ? String(metadata.slug) : undefined,
      filename: `${uuid}.md`,
      currentVersion: await this.getCurrentVersion(uuid, location),
      location: location,
      creator: creator,
      lastModified: new Date().toISOString(),
      created,
      editor: metadata.editor || metadata.author || 'unknown',
      author: metadata.author ? String(metadata.author) : undefined,
      hasVersions: true,
      audienceRoles: Array.isArray(ar) && ar.length ? (ar as string[]) : undefined,
      isPrivate: isPrivateFlag,
      addon: typeof (metadata as Record<string, unknown>).addon === 'string'
        ? ((metadata as Record<string, unknown>).addon as string)
        : undefined
    });

    logger.info(`[VersioningFileProvider] Saved page '${pageName}' with versioning`);
  }

  /**
   * Move a page file from one location to another.
   * Used when the page's privacy status changes (e.g. public → private or private → public).
   */
  async movePrivatePage(uuid: string, oldCreator: string, newCreator: string): Promise<void> {
    await super.movePrivatePage(uuid, oldCreator, newCreator); // moves the .md file
    // Also move the version directory (private versions share a flat dir keyed by UUID,
    // so no creator path to move — nothing extra needed here).
    logger.info(`[VersioningFileProvider] movePrivatePage complete: ${uuid} ${oldCreator} → ${newCreator}`);
  }

  private async movePageFile(
    uuid: string,
    fromLocation: 'pages' | 'required-pages' | 'private',
    fromCreator: string | undefined,
    toLocation: 'pages' | 'required-pages' | 'private',
    toCreator: string | undefined
  ): Promise<void> {
    if (!this.pagesDirectory) return;

    const fromPath = fromLocation === 'private' && fromCreator
      ? path.join(this.pagesDirectory, 'private', fromCreator, `${uuid}.md`)
      : path.join(this.pagesDirectory, `${uuid}.md`);

    const toPath = toLocation === 'private' && toCreator
      ? path.join(this.pagesDirectory, 'private', toCreator, `${uuid}.md`)
      : path.join(this.pagesDirectory, `${uuid}.md`);

    if (fromPath === toPath) return;

    if (await fs.pathExists(fromPath)) {
      await fs.ensureDir(path.dirname(toPath));
      await fs.move(fromPath, toPath, { overwrite: true });
      logger.info(`[VersioningFileProvider] Moved page file: ${fromPath} → ${toPath}`);
    }
  }

  /**
   * Move a version directory from one location to another.
   * Used when the page's privacy status changes.
   */
  private async moveVersionDirectory(
    uuid: string,
    fromLocation: 'pages' | 'required-pages' | 'private',
    toLocation: 'pages' | 'required-pages' | 'private'
  ): Promise<void> {
    const fromDir = this.getVersionDirectory(uuid, fromLocation);
    const toDir = this.getVersionDirectory(uuid, toLocation);

    if (fromDir === toDir) return;

    if (await fs.pathExists(fromDir)) {
      await fs.ensureDir(path.dirname(toDir));
      await fs.move(fromDir, toDir, { overwrite: true });
      logger.info(`[VersioningFileProvider] Moved version directory: ${fromDir} → ${toDir}`);
    }
  }

  /**
   * Delete a page and its version history
   * @param identifier - Page UUID or title
   * @returns True if deleted, false if not found
   */
  async deletePage(identifier: string): Promise<boolean> {
    // Get page info before deleting
    const pageData = await this.getPage(identifier);
    if (!pageData) {
      logger.warn(`[VersioningFileProvider] Cannot delete - page not found: ${identifier}`);
      return false;
    }

    const uuid = pageData.uuid;
    // Use page index entry for accurate location (handles 'private' pages too)
    const location: 'pages' | 'required-pages' | 'private' =
      this.pageIndex?.pages[uuid]?.location ||
      (pageData.metadata?.['system-category']?.toLowerCase() === 'system' ? 'required-pages' : 'pages');

    try {
      // Call parent to delete main file and clear caches
      const deleted = await super.deletePage(identifier);
      if (!deleted) {
        return false;
      }

      // Delete version directory if it exists
      const versionDir = this.getVersionDirectory(uuid, location);
      const versionDirExists = await fs.pathExists(versionDir);
      if (versionDirExists) {
        await fs.remove(versionDir);
        logger.info(`[VersioningFileProvider] Deleted version directory for ${uuid}`);
      }

      // Remove from page index
      await this.removePageFromIndex(uuid);

      logger.info(`[VersioningFileProvider] Deleted page '${identifier}' with all versions`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[VersioningFileProvider] Failed to delete page: ${identifier}`, { error: errorMessage });
      return false;
    }
  }

  /**
   * Create initial version (v1) for a new page
   * @param uuid - Page UUID
   * @param pageName - Page title
   * @param content - Page content
   * @param metadata - Page metadata
   * @param location - 'pages' or 'required-pages'
   */
  private async createInitialVersion(
    uuid: string,
    pageName: string,
    content: string,
    metadata: Partial<PageFrontmatter>,
    location: 'pages' | 'required-pages' | 'private'
  ): Promise<void> {
    const versionDir = this.getVersionDirectory(uuid, location);
    const v1Dir = path.join(versionDir, 'v1');
    await fs.ensureDir(v1Dir);

    // Write full content for v1
    await fs.writeFile(path.join(v1Dir, 'content.md'), content, 'utf8');

    // Create version metadata (stored in manifest.json only - single source of truth)
    const versionMetadata: InternalVersionMetadata = {
      version: 1,
      dateCreated: new Date().toISOString(),
      editor: metadata.editor || metadata.author || 'unknown',
      changeType: 'created',
      comment: (metadata as ExtendedMetadata).comment || 'Initial version',
      contentHash: DeltaStorage.calculateHash(content),
      contentSize: Buffer.byteLength(content, 'utf8'),
      compressed: false,
      isDelta: false
    };

    // Create and save manifest
    const manifest = this.createInitialManifest(uuid, pageName);
    this.addVersionToManifest(manifest, versionMetadata);
    await this.saveManifest(uuid, location, manifest);

    logger.info(`[VersioningFileProvider] Created v1 for page ${pageName} (${uuid})`);
  }

  /**
   * Create new version for existing page
   * @param uuid - Page UUID
   * @param pageName - Page title
   * @param newContent - New content
   * @param metadata - Page metadata
   * @param location - 'pages' or 'required-pages'
   * @param pageInfo - Current page info
   */
  private async createNewVersion(
    uuid: string,
    pageName: string,
    newContent: string,
    metadata: Partial<PageFrontmatter>,
    location: 'pages' | 'required-pages' | 'private',
    _pageInfo: WikiPage
  ): Promise<void> {
    // Load manifest
    let manifest = await this.loadManifest(uuid, location);
    if (!manifest) {
      logger.warn(`[VersioningFileProvider] No manifest found for ${pageName}, creating new`);
      manifest = this.createInitialManifest(uuid, pageName);
    }

    const nextVersion = manifest.currentVersion + 1;
    const versionDir = this.getVersionDirectory(uuid, location);
    const vNextDir = path.join(versionDir, `v${nextVersion}`);
    await fs.ensureDir(vNextDir);

    // Read current content from previous version file (not from pageInfo)
    // This ensures we're comparing the exact content we saved, not parsed content
    let currentContent: string;
    try {
      const currentVersion = manifest.currentVersion;
      if (currentVersion === 1) {
        // Read from v1/content.md
        const v1Path = path.join(versionDir, 'v1', 'content.md');
        currentContent = await fs.readFile(v1Path, 'utf8');
      } else {
        // Reconstruct from v1 + diffs
        currentContent = await this.reconstructVersion(uuid, location, currentVersion);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[VersioningFileProvider] Failed to read current content:', errorMessage);
      currentContent = '';
    }

    // Create version based on delta storage setting and checkpoints
    let versionMetadata: InternalVersionMetadata;
    const isCheckpoint = (nextVersion % this.checkpointInterval === 0);

    if (this.deltaStorageEnabled && nextVersion > 1 && !isCheckpoint) {
      // Create and save diff (unless this is a checkpoint)
      const diff = DeltaStorage.createDiff(currentContent, newContent);
      await fs.writeFile(
        path.join(vNextDir, 'content.diff'),
        JSON.stringify(diff),
        'utf8'
      );

      versionMetadata = {
        dateCreated: new Date().toISOString(),
        editor: metadata.editor || metadata.author || 'unknown',
        changeType: (metadata as ExtendedMetadata).changeType || 'updated',
        comment: (metadata as ExtendedMetadata).comment || `Update to version ${nextVersion}`,
        contentHash: DeltaStorage.calculateHash(newContent),
        contentSize: Buffer.byteLength(JSON.stringify(diff), 'utf8'),
        compressed: false,
        isDelta: true,
        isCheckpoint: false
      };
    } else {
      // Store full content (v1, delta storage disabled, or checkpoint)
      await fs.writeFile(path.join(vNextDir, 'content.md'), newContent, 'utf8');

      const comment = isCheckpoint
        ? `Checkpoint at version ${nextVersion}`
        : ((metadata as ExtendedMetadata).comment || `Update to version ${nextVersion}`);

      versionMetadata = {
        dateCreated: new Date().toISOString(),
        editor: metadata.editor || metadata.author || 'unknown',
        changeType: (metadata as ExtendedMetadata).changeType || 'updated',
        comment: comment,
        contentHash: DeltaStorage.calculateHash(newContent),
        contentSize: Buffer.byteLength(newContent, 'utf8'),
        compressed: false,
        isDelta: false,
        isCheckpoint: isCheckpoint
      };

      if (isCheckpoint) {
        logger.info(`[VersioningFileProvider] Created checkpoint at v${nextVersion} for page ${pageName}`);
      }
    }

    // Update manifest (single source of truth for metadata)
    // Note: No longer writing individual v{N}/meta.json files
    this.addVersionToManifest(manifest, versionMetadata);
    await this.saveManifest(uuid, location, manifest);

    logger.info(`[VersioningFileProvider] Created v${nextVersion} for page ${pageName} (${uuid})`);
  }

  /**
   * Get current version number for a page
   * @param uuid - Page UUID
   * @param location - 'pages' or 'required-pages'
   * @returns Current version number (0 if no versions)
   */
  private getCurrentVersion(uuid: string, location: 'pages' | 'required-pages' | 'private'): Promise<number> {
    return this.loadManifest(uuid, location).then(manifest => manifest ? manifest.currentVersion : 0);
  }

  /**
   * Reconstruct content for a specific version by applying diffs
   *
   * Performance optimized: Uses nearest checkpoint instead of always starting from v1.
   *
   * @param uuid - Page UUID
   * @param location - 'pages' or 'required-pages'
   * @param targetVersion - Version to reconstruct
   * @returns Reconstructed content
   */
  private async reconstructVersion(uuid: string, location: 'pages' | 'required-pages' | 'private', targetVersion: number): Promise<string> {
    // Check cache first
    const cacheKey = `${uuid}:${targetVersion}`;
    if (this.versionCache.has(cacheKey)) {
      this.updateCacheAccess(cacheKey);
      return this.versionCache.get(cacheKey) as string;
    }

    const versionDir = this.getVersionDirectory(uuid, location);

    // Find nearest checkpoint at or before target version
    let startVersion = 1;
    for (let v = targetVersion; v >= 1; v--) {
      if (v === 1 || (v % this.checkpointInterval === 0)) {
        // Check if this checkpoint exists
        const checkpointPath = path.join(versionDir, `v${v}`, 'content.md');
        if (await fs.pathExists(checkpointPath)) {
          startVersion = v;
          break;
        }
      }
    }

    // Read from nearest checkpoint
    const startPath = path.join(versionDir, `v${startVersion}`, 'content.md');
    if (!await fs.pathExists(startPath)) {
      throw new Error(`Checkpoint v${startVersion} not found: ${startPath}`);
    }
    let content = await fs.readFile(startPath, 'utf8');

    // If we're at the target version, we're done
    if (targetVersion === startVersion) {
      this.addToCache(cacheKey, content);
      return content;
    }

    // Apply diffs sequentially from checkpoint + 1 to target version
    for (let v = startVersion + 1; v <= targetVersion; v++) {
      const diffPath = path.join(versionDir, `v${v}`, 'content.diff');
      if (!await fs.pathExists(diffPath)) {
        throw new Error(`Diff file not found for v${v}: ${diffPath}`);
      }

      const diffData = await fs.readFile(diffPath, 'utf8');
      const diff = JSON.parse(diffData) as DiffTuple[];
      content = DeltaStorage.applyDiff(content, diff);
    }

    // Add to cache
    this.addToCache(cacheKey, content);

    return content;
  }

  /**
   * Add content to version cache (LRU eviction)
   * @param key - Cache key
   * @param content - Content to cache
   */
  private addToCache(key: string, content: string): void {
    // Remove oldest entry if cache is full
    if (this.versionCache.size >= this.versionCacheSize) {
      const firstKey = this.versionCache.keys().next().value;
      if (firstKey !== undefined) {
        this.versionCache.delete(firstKey);
      }
    }

    this.versionCache.set(key, content);
  }

  /**
   * Update cache access (move to end for LRU)
   * @param key - Cache key
   */
  private updateCacheAccess(key: string): void {
    const content = this.versionCache.get(key);
    if (content !== undefined) {
      this.versionCache.delete(key);
      this.versionCache.set(key, content);
    }
  }

  // ============================================================================
  // Version Retrieval Methods
  // ============================================================================

  /**
   * Resolve identifier (UUID or title) to UUID and location
   * @param identifier - Page UUID or title
   * @returns UUID and location, or null if not found
   */
  private resolveIdentifier(identifier: string): Promise<{ uuid: string; location: 'pages' | 'required-pages' | 'private' } | null> {
    // Check if identifier is already a UUID (in page index)
    if (this.pageIndex && this.pageIndex.pages[identifier]) {
      return Promise.resolve({
        uuid: identifier,
        location: this.pageIndex.pages[identifier].location || 'pages'
      });
    }

    // Try slug index before title lookup (handles URL-friendly slugs like 'volcanoes-and-earthquakes')
    const slugKey = this.slugIndex.get(identifier.toLowerCase());
    if (slugKey) {
      return this.getPage(slugKey)
        .then(pageInfo => {
          if (pageInfo && pageInfo.uuid) {
            const location = this.pageIndex?.pages[pageInfo.uuid]?.location || 'pages';
            return { uuid: pageInfo.uuid, location };
          }
          return null;
        })
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[VersioningFileProvider] Failed to resolve slug '${identifier}':`, errorMessage);
          return null;
        });
    }

    // Try to find by title using pageExists and getPage
    if (this.pageExists(identifier)) {
      return this.getPage(identifier)
        .then(pageInfo => {
          if (pageInfo && pageInfo.uuid) {
            // Determine location from page index or default to 'pages'
            const location = this.pageIndex?.pages[pageInfo.uuid]?.location || 'pages';
            return {
              uuid: pageInfo.uuid,
              location: location
            };
          }
          return null;
        })
        .catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`[VersioningFileProvider] Failed to resolve identifier '${identifier}':`, errorMessage);
          return null;
        });
    }

    return Promise.resolve(null);
  }

  /**
   * Get version history for a page
   *
   * Returns an array of version metadata sorted by version number (newest first).
   * Each entry includes: version, dateCreated, editor, changeType, comment, contentHash, contentSize.
   *
   * @param identifier - Page UUID or title
   * @param limit - Maximum number of versions to return (optional)
   * @returns Array of version metadata (empty array if no versions)
   * @throws {Error} If page not found
   * @example
   * const history = await provider.getVersionHistory('Main');
   * // [
   * //   { version: 3, timestamp: '2024-01-03T...', author: 'john', ... },
   * //   { version: 2, timestamp: '2024-01-02T...', author: 'jane', ... },
   * //   { version: 1, timestamp: '2024-01-01T...', author: 'admin', ... }
   * // ]
   */
  async getVersionHistory(identifier: string, limit?: number): Promise<VersionHistoryEntry[]> {
    // Resolve identifier to UUID and location
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new Error(`Page not found: ${identifier}`);
    }

    const { uuid, location } = resolved;

    // Load manifest
    const manifest = await this.loadManifest(uuid, location);
    if (!manifest || !manifest.versions || manifest.versions.length === 0) {
      return [];
    }

    // Convert to VersionHistoryEntry and return in reverse order (newest first)
    let versions = [...manifest.versions].reverse().map(v => ({
      version: v.version ?? 0,
      author: v.editor,
      timestamp: v.dateCreated,
      changeType: v.changeType as 'create' | 'update' | 'minor' | 'major',
      message: v.comment,
      contentSize: v.contentSize,
      compressed: v.compressed
    }));

    // Apply limit if specified
    if (limit && limit > 0) {
      versions = versions.slice(0, limit);
    }

    return versions;
  }

  /**
   * Get specific version content for a page
   *
   * Reconstructs the content for a specific version by:
   * 1. Reading v1 (full content)
   * 2. If version > 1 and delta storage enabled: apply diffs sequentially
   * 3. If version > 1 and delta storage disabled: read full content directly
   *
   * @param identifier - Page UUID or title
   * @param version - Version number to retrieve
   * @returns Version content and metadata
   * @throws {Error} If page/version not found or reconstruction fails
   * @example
   * const { content, metadata } = await provider.getPageVersion('Main', 2);
   * console.log(content); // Content at version 2
   * console.log(metadata.author); // Editor of version 2
   */
  async getPageVersion(identifier: string, version: number): Promise<VersionContent> {
    if (typeof version !== 'number' || version < 1) {
      throw new Error(`Invalid version number: ${version}`);
    }

    // Resolve identifier to UUID and location
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new Error(`Page not found: ${identifier}`);
    }

    const { uuid, location } = resolved;

    // Load manifest
    const manifest = await this.loadManifest(uuid, location);
    if (!manifest) {
      throw new Error(`No version history found for: ${identifier}`);
    }

    if (version > manifest.currentVersion) {
      throw new Error(`Version ${version} does not exist (current: ${manifest.currentVersion})`);
    }

    // Get version metadata
    const versionMetadata = manifest.versions.find(v => v.version === version);
    if (!versionMetadata) {
      throw new Error(`Version ${version} metadata not found in manifest`);
    }

    const versionDir = this.getVersionDirectory(uuid, location);

    // Reconstruct content based on delta storage setting
    let content: string;
    if (this.deltaStorageEnabled) {
      // Use delta reconstruction (works for all versions including v1)
      content = await this.reconstructVersion(uuid, location, version);
    } else {
      // Delta storage disabled: read full content directly
      const vPath = path.join(versionDir, `v${version}`, 'content.md');
      if (!await fs.pathExists(vPath)) {
        throw new Error(`Version ${version} content file not found: ${vPath}`);
      }
      content = await fs.readFile(vPath, 'utf8');
    }

    // Convert to VersionContent format
    return {
      version: version,
      content: content,
      metadata: {
        version: versionMetadata.version ?? version,
        author: versionMetadata.editor,
        timestamp: versionMetadata.dateCreated,
        changeType: versionMetadata.changeType as 'create' | 'update' | 'minor' | 'major',
        message: versionMetadata.comment,
        contentHash: versionMetadata.contentHash,
        contentSize: versionMetadata.contentSize,
        compressed: versionMetadata.compressed,
        isDelta: versionMetadata.isDelta,
        baseVersion: undefined,
        compressionRatio: undefined
      }
    };
  }

  /**
   * Restore page to a specific version
   *
   * Creates a new version with the content from the specified version.
   * This does NOT delete newer versions - it creates a new version with old content.
   *
   * @param identifier - Page UUID or title
   * @param version - Version number to restore to
   * @throws {Error} If page/version not found or restore fails
   * @example
   * await provider.restoreVersion('Main', 5);
   * console.log(`Restored to v5`);
   */
  async restoreVersion(identifier: string, version: number): Promise<void> {
    // Get the content from the target version
    const { content, metadata: _versionMetadata } = await this.getPageVersion(identifier, version);

    // Resolve identifier to get current page info
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new Error(`Page not found: ${identifier}`);
    }

    const { uuid } = resolved;

    // Get current page to get title
    const currentPage = await this.getPage(identifier);
    if (!currentPage) {
      throw new Error(`Page not found: ${identifier}`);
    }
    const pageName = currentPage.title || identifier;

    // Save as new version with restore metadata
    const editor = 'system';
    const comment = `Restored from v${version}`;

    await this.savePage(pageName, content, {
      uuid: uuid,
      editor: editor,
      comment: comment,
      changeType: 'restored'
    } as ExtendedMetadata);

    // Get the new version number for logging
    const location = this.pageIndex?.pages[uuid]?.location || 'pages';
    const newVersion = await this.getCurrentVersion(uuid, location);

    logger.info(`[VersioningFileProvider] Restored page '${pageName}' to v${version}, created v${newVersion}`);
  }

  /**
   * Compare two versions of a page
   *
   * Returns a diff showing changes between two versions.
   * Uses DeltaStorage to compute the diff.
   *
   * @param identifier - Page UUID or title
   * @param v1 - First version number (older)
   * @param v2 - Second version number (newer)
   * @returns Comparison result with diff and stats
   * @throws {Error} If page/versions not found
   * @example
   * const comparison = await provider.compareVersions('Main', 2, 5);
   * console.log(comparison.stats); // { additions: 10, deletions: 3, unchanged: 100 }
   * console.log(comparison.diff); // Array of diff operations
   */
  async compareVersions(identifier: string, v1: number, v2: number): Promise<VersionDiff> {
    if (typeof v1 !== 'number' || typeof v2 !== 'number') {
      throw new Error('Version numbers must be integers');
    }

    if (v1 < 1 || v2 < 1) {
      throw new Error('Version numbers must be >= 1');
    }

    // Get content for both versions
    const version1Data = await this.getPageVersion(identifier, v1);
    const version2Data = await this.getPageVersion(identifier, v2);

    // Calculate diff from version1 to version2
    const diff = DeltaStorage.createDiff(version1Data.content, version2Data.content);
    const stats = DeltaStorage.getDiffStats(diff);

    return {
      fromVersion: v1,
      toVersion: v2,
      fromMetadata: version1Data.metadata,
      toMetadata: version2Data.metadata,
      diff: diff,
      stats: stats
    };
  }

  // ============================================================================
  // Maintenance Methods
  // ============================================================================

  /**
   * Purge old versions of a page
   *
   * Removes old versions based on retention policies:
   * - Keep versions newer than retentionDays
   * - Keep last keepLatest versions (minimum)
   * - Optionally keep milestone versions (v1, every 10th version)
   *
   * @param identifier - Page UUID or title
   * @param options - Purge options (keepLatest, retentionDays, keepMilestones, dryRun)
   * @returns PurgeResult with versionsRemoved count, purged version numbers, dryRun flag, and message
   * @throws {Error} If page not found or purge fails
   * @example
   * const result = await provider.purgeOldVersions('Main', { keepLatest: 20 });
   * console.log(`Removed ${result.versionsRemoved} versions`);
   */
  async purgeOldVersions(identifier: string, options: { keepLatest?: number; retentionDays?: number; keepMilestones?: boolean; dryRun?: boolean } = {}): Promise<{ versionsRemoved: number; versionsPurged: number[]; dryRun: boolean; spaceFreed: number; message: string }> {
    const keepLatest = options.keepLatest ?? this.maxVersions;
    const retentionDays = options.retentionDays ?? this.retentionDays;
    const keepMilestones = options.keepMilestones ?? true;
    const dryRun = options.dryRun ?? false;

    // Resolve identifier to UUID and location
    const resolved = await this.resolveIdentifier(identifier);
    if (!resolved) {
      throw new Error(`Page not found: ${identifier}`);
    }

    const { uuid, location } = resolved;

    // Load manifest
    const manifest = await this.loadManifest(uuid, location);
    if (!manifest || manifest.versions.length === 0) {
      return { versionsRemoved: 0, versionsPurged: [], dryRun, spaceFreed: 0, message: 'No versions meet purge criteria' };
    }

    // Calculate cutoff date for retention
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const versionDir = this.getVersionDirectory(uuid, location);
    const versionsToPurge: number[] = [];

    // Determine which versions to purge
    for (const versionMeta of manifest.versions) {
      const versionNum = versionMeta.version;
      if (versionNum === undefined) {
        continue;
      }

      // Always keep the last keepLatest versions
      const versionsFromEnd = manifest.currentVersion - versionNum + 1;
      if (versionsFromEnd <= keepLatest) {
        continue;
      }

      // Check retention date (skip if retentionDays is 0 — purge by count only)
      if (retentionDays > 0) {
        const versionDate = new Date(versionMeta.dateCreated);
        if (versionDate >= cutoffDate) {
          continue; // Too recent to purge
        }
      }

      // Keep milestones (v1, every 10th version)
      if (keepMilestones && (versionNum === 1 || versionNum % 10 === 0)) {
        continue;
      }

      // Mark for purging
      versionsToPurge.push(versionNum);
    }

    if (versionsToPurge.length === 0) {
      return { versionsRemoved: 0, versionsPurged: [], dryRun, spaceFreed: 0, message: 'No versions meet purge criteria' };
    }

    if (dryRun) {
      return { versionsRemoved: versionsToPurge.length, versionsPurged: versionsToPurge, dryRun: true, spaceFreed: 0, message: `Dry run: would remove ${versionsToPurge.length} versions` };
    }

    let spaceFreed = 0;

    // Perform purge
    for (const versionNum of versionsToPurge) {
      try {
        const vPath = path.join(versionDir, `v${versionNum}`);
        try {
          const stat = await fs.stat(vPath);
          spaceFreed += stat.size;
        } catch { /* ignore stat errors */ }
        await fs.remove(vPath);
        logger.info(`[VersioningFileProvider] Purged version ${versionNum} of page ${uuid}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[VersioningFileProvider] Failed to purge v${versionNum}: ${errorMessage}`);
      }
    }

    // Update manifest (remove purged versions)
    manifest.versions = manifest.versions.filter(v => v.version !== undefined && !versionsToPurge.includes(v.version));
    await this.saveManifest(uuid, location, manifest);

    logger.info(`[VersioningFileProvider] Purged ${versionsToPurge.length} versions from page ${uuid}`);
    return { versionsRemoved: versionsToPurge.length, versionsPurged: versionsToPurge, dryRun: false, spaceFreed, message: `Purged ${versionsToPurge.length} versions` };
  }

  /**
   * Get provider information
   * @returns Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'VersioningFileProvider',
      version: '1.0.0',
      description: 'File storage with version history and delta storage',
      features: [
        'uuid-indexing',
        'title-indexing',
        'plural-matching',
        'dual-storage',
        'case-insensitive-lookup',
        'version-history',
        'delta-storage',
        'compression',
        'page-index',
        'version-purging'
      ]
    };
  }
}

export default VersioningFileProvider;

