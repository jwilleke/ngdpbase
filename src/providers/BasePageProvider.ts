import logger from '../utils/logger.js';
import { WikiPage, PageFrontmatter, PageInfo, PageSaveOptions, PageListOptions } from '../types/index.js';
import { VersionHistoryEntry, VersionContent, VersionDiff } from '../types/index.js';

/**
 * WikiEngine interface (simplified)
 * TODO: Create full WikiEngine type definition in Phase 4
 */
interface WikiEngine {
  getManager<T = unknown>(name: string): T | undefined;
}

/**
 * Provider information
 */
interface ProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
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
abstract class BasePageProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  public initialized: boolean;

  /**
   * Create a new page provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    if (!engine) {
      throw new Error('BasePageProvider requires an engine instance');
    }
    this.engine = engine;
    this.initialized = false;
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
  abstract getPage(identifier: string): Promise<WikiPage | null>;

  /**
   * Get only page content (without metadata)
   *
   * @async
   * @abstract
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<string>} Markdown content
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getPageContent(identifier: string): Promise<string>;

  /**
   * Get only page metadata (without content)
   *
   * @async
   * @abstract
   * @param {string} identifier - Page UUID, title, or slug
   * @returns {Promise<PageFrontmatter|null>} Metadata object or null if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getPageMetadata(identifier: string): Promise<PageFrontmatter | null>;

  /**
   * Save page content and metadata
   *
   * @async
   * @abstract
   * @param {string} pageName - Page title
   * @param {string} content - Markdown content
   * @param {Partial<PageFrontmatter>} metadata - Frontmatter metadata
   * @param {PageSaveOptions} options - Save options
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract savePage(
    pageName: string,
    content: string,
    metadata?: Partial<PageFrontmatter>,
    options?: PageSaveOptions
  ): Promise<void>;

  /**
   * Delete a page
   * @param {string} identifier - Page UUID or title
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  abstract deletePage(identifier: string, deletedBy?: string): Promise<boolean>;

  /**
   * Move a private page from one creator's directory to another's.
   * Called by PageManager when a private page's author changes.
   * Providers that use creator-keyed directories must override this.
   * Default: no-op (providers without creator directories do nothing).
   */
  async movePrivatePage(_uuid: string, _oldCreator: string, _newCreator: string): Promise<void> {
    // no-op default — override in file-based providers
  }

  invalidatePageCache(_identifier: string): string | null {
    return null; // no-op default — override in providers with in-memory caches
  }

  getPageUUID(_identifier: string): string | null {
    return null; // no-op default — override in providers with in-memory page caches
  }

  /**
   * Check if page exists
   * @param {string} identifier - Page UUID or title
   * @returns {boolean}
   */
  abstract pageExists(identifier: string): boolean;

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
  abstract getPageByUUID(uuid: string): Promise<WikiPage | null>;

  /**
   * Get a page by its slug
   * @param {string} slug - URL-friendly slug
   * @returns {Promise<WikiPage | null>} Page or null if not found
   */
  abstract getPageBySlug(slug: string): Promise<WikiPage | null>;

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
  getVersionHistory(_identifier: string, _limit?: number): Promise<VersionHistoryEntry[]> {
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
  getPageVersion(_identifier: string, _version: number): Promise<VersionContent> {
    throw new Error('getPageVersion() must be implemented by versioning providers');
  }

  /**
   * Restore a page to a specific version
   *
   * Creates a new version by restoring content from an older version.
   * The restoration itself becomes a new version in the history.
   *
   * @param {string} identifier - Page UUID or title
   * @param {number} version - Version number to restore to
   * @returns {Promise<void>}
   * @throws {Error} If version does not exist or restoration fails
   */
  restoreVersion(_identifier: string, _version: number): Promise<void> {
    throw new Error('restoreVersion() must be implemented by versioning providers');
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
  compareVersions(_identifier: string, _v1: number, _v2: number): Promise<VersionDiff> {
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

