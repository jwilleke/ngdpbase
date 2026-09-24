import logger from '../utils/logger.js';
import type { ProviderInfo, SavedPage, StoreDeletedEntry, StoreFileLocation, StorePageEntry } from '../types/Provider.js';
import fs from 'fs-extra';
import path from 'path';
import { WikiPage, PageFrontmatter, PageInfo, PageSaveOptions, PageListOptions } from '../types/index.js';
import { VersionHistoryEntry, VersionContent, VersionDiff } from '../types/index.js';
import BaseProvider from './BaseProvider.js';
import {
  DEFAULT_PRIVATE_STORE_LAYOUT,
  assertStoreId,
  privateStoreLayoutFromConfig,
  storeDeletedIndexPath,
  storePageIndexPath,
  storeSearchIndexPath,
  type PrivateStoreLayout
} from '../utils/privateStorePath.js';
import {
  STORE_SEARCH_INDEX_VERSION,
  type StoreSearchDocument,
  type StoreSearchIndexFile
} from '../utils/storeSearchIndex.js';
import { readStoreTextSync } from '../utils/privateStoreFiles.js';
import { assertContextCanWriteStore } from '../utils/privateStoreUnlock.js';
import type { ActorContext } from '../context/ActorContext.js';

/**
 * WikiEngine interface (simplified)
 * TODO: Create full WikiEngine type definition in Phase 4
 */
interface WikiEngine {
  getManager<T = unknown>(name: string): T | undefined;
}

/**
 * BasePageProvider - Abstract interface for page storage providers
 *
 * All page storage providers must extend this class and implement its methods.
 * Providers handle the actual storage and retrieval of wiki pages, whether
 * from filesystem, database, cloud storage, or other backends.
 *
 * This follows JSPWiki's provider pattern for pluggable storage backends.
 *
 * @class BasePageProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link FileSystemProvider} for filesystem implementation
 * @see {@link PageManager} for usage
 *
 * @example
 * class MyProvider extends BasePageProvider {
 *   async initialize() {
 *     const config = this.engine.getManager('ConfigurationManager');
 *     this.storagePath = config.getProperty('myProvider.path');
 *   }
 *   async getPage(identifier: string) {
 *     // Implementation
 *   }
 * }
 */
abstract class BasePageProvider extends BaseProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  protected initialized: boolean;

  /**
   * Private-store folder names (#1382). ConfigurationManager is the only
   * source; {@link applyPrivateStoreLayout} reads them in `initialize()`.
   * Defaults match `config/app-default-config.json`.
   */
  protected privateStoreLayout: PrivateStoreLayout;

  /**
   * Create a new page provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    super();
    if (!engine) {
      throw new Error('BasePageProvider requires an engine instance');
    }
    this.engine = engine;
    this.initialized = false;
    this.privateStoreLayout = DEFAULT_PRIVATE_STORE_LAYOUT;
  }

  /**
   * Read the private-store folder names from ConfigurationManager (via
   * getProperty, not getResolvedDataPath — they are segments under the pages
   * storagedir, joined by the helpers in `src/utils/privateStorePath.ts`).
   */
  protected applyPrivateStoreLayout(configManager: { getProperty(key: string, defaultValue: unknown): unknown }): void {
    this.privateStoreLayout = privateStoreLayoutFromConfig((key, fallback) =>
      configManager.getProperty(key, fallback)
    );
  }

  /**
   * Which store a private page is saved into — one rule for every page
   * provider (docs/planning/private-stores.md, Store placement): the store the
   * save names, else the store the page is already in, else the configured
   * default. A store id is a plain slug.
   *
   * A save that names a different store for a page that already exists is
   * refused: moving a page and its history between stores is not supported.
   *
   * @param requested - `metadata.store` from the save, if any
   * @param existing - the store the page is in now, when it is an existing private page
   */
  protected resolvePrivatePageStore(requested: unknown, existing: string | undefined): string {
    const named = typeof requested === 'string' && requested.length > 0 ? assertStoreId(requested) : undefined;
    if (named !== undefined && existing !== undefined && named !== existing) {
      throw new Error(
        `Cannot save this page into private store '${named}': it is in store '${existing}', and moving between stores is not supported`
      );
    }
    return named ?? existing ?? assertStoreId(this.privateStoreLayout.defaultStoreId);
  }

  /**
   * Refuse a write into an encrypted store this caller cannot write (#1394).
   * The one check every page provider calls before writing private bytes; the
   * keys are reached through the caller's context, never ambiently (P1).
   */
  protected async assertPrivateStoreWritable(
    ctx: ActorContext,
    pagesDirectory: string,
    owner: string,
    store: string
  ): Promise<void> {
    await assertContextCanWriteStore(ctx, {
      pagesDirectory,
      owner,
      store,
      layout: this.privateStoreLayout
    });
  }

  // ── A store's own page index (#1456) ──────────────────────────────────────
  //
  // A store is self-contained (docs/planning/private-stores.md): its pages are
  // listed in `{store}/pages-index.json`, never in the global page index or a
  // process cache. It is read and written through the location's I/O, so an
  // encrypted store's index is sealed without this provider deciding it, and
  // read when a request needs it — never copied (operator, 2026-09-22).

  /** A store's pages, keyed by uuid. A store with no pages yet has none. */
  protected async readStorePages(
    pagesDirectory: string,
    location: StoreFileLocation
  ): Promise<Record<string, StorePageEntry>> {
    const file = storePageIndexPath(pagesDirectory, location.owner, location.store, this.privateStoreLayout);
    if (!await fs.pathExists(file)) return {};
    const parsed = JSON.parse(await location.io.readText(file)) as { version?: number; pages?: Record<string, StorePageEntry> };
    return parsed && typeof parsed.pages === 'object' && parsed.pages ? parsed.pages : {};
  }

  protected async writeStorePages(
    pagesDirectory: string,
    location: StoreFileLocation,
    pages: Record<string, StorePageEntry>
  ): Promise<void> {
    const file = storePageIndexPath(pagesDirectory, location.owner, location.store, this.privateStoreLayout);
    await fs.ensureDir(path.dirname(file));
    await location.io.writeText(file, JSON.stringify({ version: 1, pages }));
  }

  /** Add or replace one page in its store's index. */
  protected async putStorePage(pagesDirectory: string, location: StoreFileLocation, entry: StorePageEntry): Promise<void> {
    const pages = await this.readStorePages(pagesDirectory, location);
    pages[entry.uuid] = entry;
    await this.writeStorePages(pagesDirectory, location, pages);
  }

  /** Remove one page from its store's index; false when it was not listed. */
  protected async dropStorePage(pagesDirectory: string, location: StoreFileLocation, uuid: string): Promise<boolean> {
    const pages = await this.readStorePages(pagesDirectory, location);
    if (!(uuid in pages)) return false;
    delete pages[uuid];
    await this.writeStorePages(pagesDirectory, location, pages);
    return true;
  }

  /**
   * A store's pages, read synchronously as `ctx` may: null when the store is
   * encrypted and `ctx` does not hold its key. Page lookups are synchronous,
   * and the index is one small file (#1456).
   */
  protected readStorePagesSync(
    pagesDirectory: string,
    owner: string,
    store: string,
    ctx: ActorContext | undefined
  ): Record<string, StorePageEntry> | null {
    const text = readStoreTextSync(ctx, {
      pagesDirectory,
      owner,
      store,
      file: storePageIndexPath(pagesDirectory, owner, store, this.privateStoreLayout),
      layout: this.privateStoreLayout
    });
    if (text === null) return null;
    const parsed = JSON.parse(text) as { pages?: Record<string, StorePageEntry> };
    return parsed && typeof parsed.pages === 'object' && parsed.pages ? parsed.pages : {};
  }

  /** One entry of a store's pages by uuid, title or slug (case-insensitive for the last two). */
  protected static findInStorePages(pages: Record<string, StorePageEntry>, key: string): StorePageEntry | null {
    if (pages[key]) return pages[key];
    const lower = key.toLowerCase();
    return Object.values(pages).find((p) =>
      p.title.toLowerCase() === lower || (p.slug != null && p.slug.toLowerCase() === lower)
    ) ?? null;
  }

  /**
   * One page of a store, by uuid, title or slug (case-insensitive for the
   * last two) — titles are unique within a store, never across the site.
   */
  protected async findStorePage(
    pagesDirectory: string,
    location: StoreFileLocation,
    key: string
  ): Promise<StorePageEntry | null> {
    return BasePageProvider.findInStorePages(await this.readStorePages(pagesDirectory, location), key);
  }

  // ── A store's own trash (#1459) ───────────────────────────────────────────
  //
  // The same shape and the same I/O as the page index above, for the same
  // reason: a deleted private page is recorded in its OWN store, sealed
  // exactly when the store is. Nothing about it reaches `pages/deleted/`,
  // `page-index.json` or the global tombstone map, so an admin's
  // /admin/deleted-pages cannot show it and no background listing can.

  /** A store's tombstones, keyed by page uuid. A store that has never had a delete has none. */
  protected async readStoreDeleted(
    pagesDirectory: string,
    location: StoreFileLocation
  ): Promise<Record<string, StoreDeletedEntry>> {
    const file = storeDeletedIndexPath(pagesDirectory, location.owner, location.store, this.privateStoreLayout);
    if (!await fs.pathExists(file)) return {};
    const parsed = JSON.parse(await location.io.readText(file)) as { version?: number; deleted?: Record<string, StoreDeletedEntry> };
    return parsed && typeof parsed.deleted === 'object' && parsed.deleted ? parsed.deleted : {};
  }

  protected async writeStoreDeleted(
    pagesDirectory: string,
    location: StoreFileLocation,
    deleted: Record<string, StoreDeletedEntry>
  ): Promise<void> {
    const file = storeDeletedIndexPath(pagesDirectory, location.owner, location.store, this.privateStoreLayout);
    await fs.ensureDir(path.dirname(file));
    await location.io.writeText(file, JSON.stringify({ version: 1, deleted }));
  }

  /** Record one tombstone in its store's trash. */
  protected async putStoreDeleted(
    pagesDirectory: string,
    location: StoreFileLocation,
    entry: StoreDeletedEntry
  ): Promise<void> {
    const deleted = await this.readStoreDeleted(pagesDirectory, location);
    deleted[entry.uuid] = entry;
    await this.writeStoreDeleted(pagesDirectory, location, deleted);
  }

  /** Take one tombstone out; the entry it removed, or null when there was none. */
  protected async dropStoreDeleted(
    pagesDirectory: string,
    location: StoreFileLocation,
    uuid: string
  ): Promise<StoreDeletedEntry | null> {
    const deleted = await this.readStoreDeleted(pagesDirectory, location);
    const entry = deleted[uuid];
    if (!entry) return null;
    delete deleted[uuid];
    await this.writeStoreDeleted(pagesDirectory, location, deleted);
    return entry;
  }

  // ── A store's own saved search index (#1458) ──────────────────────────────
  //
  // Beside the page index, written through the same location I/O, for the same
  // reason: the provider owns the store's bytes and decides nothing about them
  // (Manager-SOT). It is saved rather than built at search time so a search
  // reads one small file per store and never opens a page file.

  /** Where the store's search index lives — for a caller that must look at the file itself. */
  protected storeSearchFile(pagesDirectory: string, owner: string, store: string): string {
    return storeSearchIndexPath(pagesDirectory, owner, store, this.privateStoreLayout);
  }

  /** True when this store has a saved search index; false means it must be built. */
  protected async storeSearchIndexExists(pagesDirectory: string, owner: string, store: string): Promise<boolean> {
    return fs.pathExists(this.storeSearchFile(pagesDirectory, owner, store));
  }

  /** A store's search documents, keyed by page uuid. A store with no index yet has none. */
  protected async readStoreSearch(
    pagesDirectory: string,
    location: StoreFileLocation
  ): Promise<Record<string, StoreSearchDocument>> {
    const file = this.storeSearchFile(pagesDirectory, location.owner, location.store);
    if (!await fs.pathExists(file)) return {};
    const parsed = JSON.parse(await location.io.readText(file)) as Partial<StoreSearchIndexFile>;
    return parsed && typeof parsed.documents === 'object' && parsed.documents ? parsed.documents : {};
  }

  protected async writeStoreSearch(
    pagesDirectory: string,
    location: StoreFileLocation,
    documents: Record<string, StoreSearchDocument>
  ): Promise<void> {
    const file = this.storeSearchFile(pagesDirectory, location.owner, location.store);
    await fs.ensureDir(path.dirname(file));
    const contents: StoreSearchIndexFile = { version: STORE_SEARCH_INDEX_VERSION, documents };
    await location.io.writeText(file, JSON.stringify(contents));
  }

  /** Add or replace one page's document in its store's search index. */
  protected async putStoreSearchDocument(
    pagesDirectory: string,
    location: StoreFileLocation,
    document: StoreSearchDocument
  ): Promise<void> {
    const documents = await this.readStoreSearch(pagesDirectory, location);
    documents[document.uuid] = document;
    await this.writeStoreSearch(pagesDirectory, location, documents);
  }

  /** Remove one page's document; false when it was not there. */
  protected async dropStoreSearchDocument(
    pagesDirectory: string,
    location: StoreFileLocation,
    uuid: string
  ): Promise<boolean> {
    const documents = await this.readStoreSearch(pagesDirectory, location);
    if (!(uuid in documents)) return false;
    delete documents[uuid];
    await this.writeStoreSearch(pagesDirectory, location, documents);
    return true;
  }

  /**
   * Initialize the provider with configuration
   *
   * IMPORTANT: Providers MUST access configuration via ConfigurationManager:
   *   const configManager = this.engine.getManager('ConfigurationManager');
   *   const value = configManager.getProperty('key', 'default');
   *
   * Do NOT read configuration files directly.
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract initialize(): Promise<void>;

  /**
   * Get complete page with content and metadata
   *
   * @async
   * @abstract
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<WikiPage|null>} Page object or null if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getPage(identifier: string, ctx: ActorContext): Promise<WikiPage | null>;

  /**
   * Get only page content (without metadata)
   *
   * @async
   * @abstract
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<string>} Markdown content
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getPageContent(identifier: string, ctx: ActorContext): Promise<string>;

  /**
   * Get only page metadata (without content)
   *
   * @async
   * @abstract
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<PageFrontmatter|null>} Metadata object or null if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getPageMetadata(identifier: string, ctx: ActorContext): Promise<PageFrontmatter | null>;

  /**
   * Save page content and metadata
   *
   * @async
   * @abstract
   * @param {string} pageName - Page title
   * @param {string} content - Markdown content
   * @param {Partial<PageFrontmatter>} metadata - Frontmatter metadata
   * @param ctx - Who is writing (#1179): the request's subject, or a JobContext. Mandatory and positional — a store write reaches this caller's keys through it (#1382)
   * @param {PageSaveOptions} options - Save options
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract savePage(
    pageName: string,
    content: string,
    metadata: Partial<PageFrontmatter> | undefined,
    ctx: ActorContext,
    options?: PageSaveOptions
  ): Promise<SavedPage>;

  /**
   * Delete a page
   * @param {string} identifier - Page UUID or title
   * @param ctx - Who is deleting (#1179). Names the deleter on the record and reaches a private store's keys (#1382)
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  abstract deletePage(identifier: string, ctx: ActorContext): Promise<boolean>;

  invalidatePageCache(_identifier: string): string | null {
    return null; // no-op default — override in providers with in-memory caches
  }

  getPageUUID(_identifier: string, _ctx: ActorContext): string | null {
    return null; // no-op default — override in providers with in-memory page caches
  }

  /**
   * Check if page exists
   * @param {string} identifier - Page UUID or title
   * @returns {boolean}
   */
  abstract pageExists(identifier: string, ctx: ActorContext): boolean;

  /**
   * Get all page titles
   * @returns {Promise<string[]>} Sorted array of page titles
   */
  abstract getAllPages(): Promise<string[]>;

  /**
   * Get all page titles (explicit alias for getAllPages)
   * Prefer this for new code that only needs page names.
   * Use getAllPageInfo() when you need uuid/slug/author etc.
   * @returns {Promise<string[]>} Sorted array of page titles
   */
  async getAllPageNames(): Promise<string[]> {
    return this.getAllPages();
  }

  /**
   * Get all page info objects
   * @param {PageListOptions} options - List options
   * @returns {Promise<PageInfo[]>} Array of page info objects
   */
  abstract getAllPageInfo(options?: PageListOptions): Promise<PageInfo[]>;

  /**
   * Find page by various identifiers
   * @param {string} identifier - UUID, title, or slug
   * @returns {string|null} Canonical page title or null
   */
  abstract findPage(identifier: string): string | null;

  /**
   * Get a page by its UUID
   * @param {string} uuid - Page UUID
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  abstract getPageByUUID(uuid: string, ctx: ActorContext): Promise<WikiPage | null>;

  /**
   * Get a page by its slug
   * @param {string} slug - URL-friendly slug
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  abstract getPageBySlug(slug: string, ctx: ActorContext): Promise<WikiPage | null>;

  /**
   * Refresh internal cache/index
   * Re-scans storage and rebuilds indexes
   * @returns {Promise<void>}
   */
  abstract refreshPageList(): Promise<void>;

  // ============================================================================
  // Versioning Methods (Optional - only for providers that support versioning)
  // ============================================================================

  /**
   * Get version history for a page
   *
   * Returns an array of version metadata entries for the specified page.
   * Providers that don't support versioning should not implement this method.
   *
   * @param {string} identifier - Page UUID or title
   * @param {number} limit - Maximum number of versions to return
   * @returns {Promise<VersionHistoryEntry[]>} Array of version history entries
   * @example
   * // Returns:
   * [
   *   {
   *     version: 1,
   *     timestamp: "2025-01-01T00:00:00.000Z",
   *     author: "user@example.com",
   *     changeType: "create",
   *     message: "Initial version",
   *     contentSize: 1234,
   *     compressed: false
   *   },
   *   {
   *     version: 2,
   *     timestamp: "2025-01-02T10:30:00.000Z",
   *     author: "editor@example.com",
   *     changeType: "update",
   *     message: "Added section",
   *     contentSize: 567,
   *     compressed: false
   *   }
   * ]
   */
  getVersionHistory(_identifier: string, _ctx: ActorContext, _limit?: number): Promise<VersionHistoryEntry[]> {
    throw new Error('getVersionHistory() must be implemented by versioning providers');
  }

  /**
   * Get a specific version of a page
   *
   * Retrieves the content and metadata for a specific version number.
   * For delta-based storage, this reconstructs the content by applying diffs.
   *
   * @param {string} identifier - Page UUID or title
   * @param {number} version - Version number to retrieve
   * @returns {Promise<VersionContent>} Version content and metadata
   * @throws {Error} If version does not exist
   */
  getPageVersion(_identifier: string, _version: number, _ctx: ActorContext): Promise<VersionContent> {
    throw new Error('getPageVersion() must be implemented by versioning providers');
  }

  /**
   * Compare two versions of a page
   *
   * Generates a diff between two versions showing what changed.
   * Returns structured diff data suitable for rendering.
   *
   * @param {string} identifier - Page UUID or title
   * @param {number} v1 - First version number (older)
   * @param {number} v2 - Second version number (newer)
   * @returns {Promise<VersionDiff>} Diff data structure
   */
  compareVersions(_identifier: string, _v1: number, _v2: number, _ctx: ActorContext): Promise<VersionDiff> {
    throw new Error('compareVersions() must be implemented by versioning providers');
  }

  /**
   * Purge old versions based on retention policy
   *
   * Removes old versions according to configuration settings (maxVersions, retentionDays).
   * Always preserves v1 (needed for delta reconstruction) and recent versions.
   *
   * @param {string} identifier - Page UUID or title
   * @param options - Purge options (keepLatest, retentionDays, keepMilestones, dryRun)
   * @returns Purge result with versionsRemoved, versionsPurged, dryRun, spaceFreed, message
   */
  purgeOldVersions(_identifier: string, _options?: { keepLatest?: number; retentionDays?: number; keepMilestones?: boolean; dryRun?: boolean }): Promise<{ versionsRemoved: number; versionsPurged: number[]; dryRun: boolean; spaceFreed: number; message: string }> {
    throw new Error('purgeOldVersions() must be implemented by versioning providers');
  }

  /**
   * Get provider information
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BasePageProvider',
      version: '1.0.0',
      description: 'Abstract base provider',
      features: []
    };
  }

  /**
   * Shutdown the provider (cleanup resources)
   * @returns {Promise<void>}
   */
  shutdown(): void {
    this.initialized = false;
    logger.info(`${this.getProviderInfo().name} shut down`);
  }
}

export default BasePageProvider;
export { WikiEngine, ProviderInfo };

