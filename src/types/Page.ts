/**
 * Page type definitions for ngdpbase
 *
 * This module defines the core types for wiki pages, including frontmatter
 * metadata, page content, and page information structures used throughout
 * the application.
 */

/**
 * Page frontmatter metadata
 *
 * Metadata stored in YAML frontmatter at the top of each markdown file.
 * All pages must have at minimum: title, uuid, and lastModified.
 */
export interface PageFrontmatter {
  /** Page title (required) */
  title: string;

  /** Unique identifier (UUID v4) */
  uuid: string;

  /** Last modification timestamp (ISO 8601 format) */
  lastModified: string;

  /**
   * Page creation timestamp (ISO 8601 format).
   *
   * Set ONCE on first save and preserved by every subsequent save —
   * `FileSystemProvider.savePage()` carries it forward from the on-disk
   * frontmatter so updates never overwrite it. Optional in the type
   * because pre-#754 pages were written without it; the migration
   * script `scripts/migrate-page-created.ts` backfills existing pages
   * from v1-manifest `dateCreated` → file mtime → `lastModified`.
   */
  created?: string;

  /** System-defined category (optional) */
  'system-category'?: string;

  /** User-defined category (optional) */
  category?: string;

  /** User-defined keywords/tags */
  'user-keywords'?: string[];

  /** URL slug for pretty URLs */
  slug?: string;

  /** Page author (user ID or 'system') */
  author?: string;

  /** Last editor (user ID or 'system') */
  editor?: string;

  /** Whether a system/documentation page has been user-modified */
  'user-modified'?: boolean;

  /** Page template to use for rendering */
  template?: string;

  /** Whether page is published/visible */
  published?: boolean;

  /** Parent page UUID for hierarchical structure */
  parent?: string;

  /** Sort order for navigation */
  order?: number;

  /** Name of the add-on that originally seeded this page, if any */
  addon?: string;

  /** Roles or usernames allowed to view this page (front matter access control) */
  audience?: string[];

  /**
   * Whether the page is private — accessible only to the page creator and admins.
   *
   * Peer of `audience` and `author-lock`; canonical signal for ACLManager's tier-0
   * private check. When true, all other per-page rules (audience, access, author-lock)
   * are bypassed and the page is stored in a separate per-creator location.
   *
   * #639: top-level field added in Slice C; user-keywords back-compat scan dropped
   * in Slice E (v3.7.0). All datasets migrated; this field is the only source of truth.
   */
  private?: boolean;

  /** Per-action principal lists — overrides audience for the named action */
  access?: {
    view?: string[];
    edit?: string[];
    delete?: string[];
    [key: string]: string[] | undefined;
  };

  /** Additional custom metadata */
  [key: string]: unknown;
}

/**
 * Complete wiki page object
 *
 * Represents a full page with content and metadata. This is the primary
 * data structure returned by PageProvider.getPage().
 */
export interface WikiPage {
  /** Page title */
  title: string;

  /** Unique identifier (UUID v4) */
  uuid: string;

  /** Markdown content (without frontmatter) */
  content: string;

  /** Frontmatter metadata */
  metadata: PageFrontmatter;

  /** Absolute file path to the page file */
  filePath: string;

  /** Location type (pages or required-pages) */
  location?: 'pages' | 'required-pages';
}

/**
 * Minimal page information for listings
 *
 * Used in page indexes, search results, and navigation where full content
 * is not needed. This is stored in page-index.json.
 */
export interface PageInfo {
  /** Page title */
  title: string;

  /** Unique identifier (UUID v4) */
  uuid: string;

  /** Absolute file path to the page file */
  filePath: string;

  /** Frontmatter metadata */
  metadata: PageFrontmatter;

  /** Location type */
  location?: 'pages' | 'required-pages';

  /** Last modification timestamp (from metadata) */
  lastModified?: string;

  /** Creation timestamp (from metadata, #754) */
  created?: string;

  /** Page author (from metadata) */
  author?: string;

  /** Last editor (from metadata) */
  editor?: string;

  /** Category (from metadata) */
  category?: string;

  /** URL slug (from metadata) */
  slug?: string;
}

/**
 * Page save options
 *
 * Options passed when saving a page to control versioning, author tracking,
 * and other save behaviors.
 */
export interface PageSaveOptions {
  /** User ID performing the save */
  author?: string;

  /** Change type (create, update, minor, major) */
  changeType?: 'create' | 'update' | 'minor' | 'major';

  /** Commit message/change description */
  message?: string;

  /** Whether to create a version entry */
  createVersion?: boolean;

  /** Additional metadata to merge */
  additionalMetadata?: Partial<PageFrontmatter>;

  /** Preserve lastModified from metadata instead of setting to now (for import/migration use) */
  preserveLastModified?: boolean;
}

/**
 * Page search result
 *
 * Extended page info with search relevance scoring and highlighting.
 */
export interface PageSearchResult extends PageInfo {
  /** Search relevance score (0-1) */
  score: number;

  /** Highlighted snippets from content */
  highlights?: string[];

  /** Matched keywords */
  matchedKeywords?: string[];
}

/**
 * Page list options
 *
 * Options for filtering and sorting page lists.
 */
export interface PageListOptions {
  /** Filter by category */
  category?: string;

  /** Filter by author */
  author?: string;

  /** Filter by keywords (AND logic) */
  keywords?: string[];

  /** Sort field */
  sortBy?: 'title' | 'lastModified' | 'author' | 'category';

  /** Sort order */
  sortOrder?: 'asc' | 'desc';

  /** Pagination: number of results per page */
  limit?: number;

  /** Pagination: page offset (0-based) */
  offset?: number;

  /** Include required-pages in results */
  includeRequired?: boolean;
}
