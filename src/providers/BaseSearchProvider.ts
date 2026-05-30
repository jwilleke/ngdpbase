/**
 * BaseSearchProvider - Base class for all search providers
 *
 * Provides the interface that all search providers must implement.
 * Follows the provider pattern established in AttachmentManager, PageManager, CacheManager, and AuditManager.
 *
 * Search providers implement different search engines (Lunr.js, Elasticsearch, etc.)
 *
 * @class BaseSearchProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link LunrSearchProvider} for Lunr.js implementation
 * @see {@link SearchManager} for usage
 *
 * Related: GitHub Issue #102 - Configuration reorganization
 */

import type { WikiEngine } from '../types/WikiEngine.js';

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
 * Search result structure
 */
export interface SearchResult {
  /** Page name/identifier */
  name: string;

  /** Page title */
  title: string;

  /** Relevance score */
  score: number;

  /** Content snippet with highlights */
  snippet: string;

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Minimal WikiContext shape needed by search providers to filter private results.
 * The full WikiContext lives in src/context/WikiContext.ts.
 *
 * Optional method declarations match the real WikiContext API (#625) so providers
 * can call `wikiContext.hasRole(...)` / `getPrincipals()` directly. Optional so
 * non-WikiContext duck-typed callers (older tests, fixtures) still satisfy the type.
 */
export interface SearchWikiContext {
  userContext?: {
    username?: string;
    roles?: string[];
    authenticated?: boolean;
    [key: string]: unknown;
  };
  hasRole?(...names: string[]): boolean;
  getPrincipals?(): string[];
  [key: string]: unknown;
}

/**
 * Search options structure
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  maxResults?: number;

  /** Fields to search in */
  searchIn?: string[];

  /** Filter by categories */
  categories?: string[];

  /** Filter by user keywords */
  userKeywords?: string[];

  /** WikiContext for the current request — used to filter private search results */
  wikiContext?: SearchWikiContext;
}

/**
 * Advanced search criteria
 */
export interface SearchCriteria {
  /** Search query */
  query?: string;

  /** Categories to filter by */
  categories?: string[];

  /** #706: knowledge-role values to filter by (source / citation / concept).
   *  Pages without a `knowledge-role` set are excluded when this filter has
   *  any entries — mirrors how `categories` excludes off-axis pages. */
  knowledgeRoles?: string[];

  /** User keywords to filter by */
  userKeywords?: string[];

  /** System keywords to filter by (auto-tagged or manually set — #507/#509) */
  systemKeywords?: string[];

  /** Fields to search in (title, content, category, keywords, or all) */
  searchIn?: string[];

  /** Author to filter by (page creator — matches metadata.author) */
  author?: string;

  /** Editor to filter by (last modifier — matches metadata.editor) */
  editor?: string;

  /** Date range */
  dateRange?: {
    from?: string;
    to?: string;
  };

  /** Maximum results to return */
  maxResults?: number;

  /** Additional criteria */
  [key: string]: unknown;
}

/**
 * Search statistics
 */
export interface SearchStatistics {
  /** Total number of indexed documents */
  documentCount: number;

  /** Index size in bytes */
  indexSize?: number;

  /** Last index update timestamp */
  lastIndexUpdate?: string;

  /** Additional statistics */
  [key: string]: unknown;
}

/**
 * Backup data structure
 */
export interface BackupData {
  /** Provider class name */
  provider: string;

  /** Whether provider was initialized */
  initialized: boolean;

  /** Backup timestamp */
  timestamp: string;

  /** Additional backup data */
  [key: string]: unknown;
}

/**
 * BaseSearchProvider - Abstract base class for search providers
 *
 * All search providers must extend this class and implement its abstract methods.
 * Provides a consistent interface for different search backend implementations.
 *
 * @abstract
 */
abstract class BaseSearchProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  protected initialized: boolean;

  /**
   * Creates a new BaseSearchProvider instance
   *
   * @param engine - Reference to the WikiEngine instance
   */
  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the search provider
   *
   * Implementations should load configuration from ConfigurationManager
   * and prepare the search backend for use.
   *
   * @returns Promise that resolves when initialization is complete
   * @abstract
   */
  abstract initialize(): Promise<void>;

  /**
   * Get provider information
   *
   * Returns metadata about this provider implementation including
   * name, version, description, and supported features.
   *
   * @returns Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BaseSearchProvider',
      version: '1.0.0',
      description: 'Base search provider interface',
      features: []
    };
  }

  /**
   * Build or rebuild the search index from all pages
   *
   * Implementations should iterate through all pages and create
   * a complete search index from scratch.
   *
   * @returns Promise that resolves when index building is complete
   * @abstract
   */
  abstract buildIndex(): Promise<void>;

  /**
   * Search for pages matching the query
   *
   * Performs a search against the index using the provided query
   * and optional search options.
   *
   * @param query - Search query string
   * @param options - Search options for filtering and limiting results
   * @returns Promise resolving to array of search results
   * @abstract
   */
  abstract search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Advanced search with multiple criteria
   *
   * Performs a more complex search using multiple criteria including
   * query, categories, keywords, author, date range, etc.
   *
   * @param criteria - Search criteria object
   * @returns Promise resolving to array of search results
   * @abstract
   */
  abstract advancedSearch(criteria?: SearchCriteria): Promise<SearchResult[]>;

  /**
   * Get search suggestions for autocomplete
   *
   * Provides search term suggestions based on a partial input,
   * useful for implementing autocomplete functionality.
   *
   * @param partial - Partial search term
   * @returns Promise resolving to array of suggested completions
   * @abstract
   */
  abstract getSuggestions(partial: string): Promise<string[]>;

  /**
   * Suggest similar pages based on content
   *
   * Finds pages similar to the specified page based on content
   * analysis and relevance scoring.
   *
   * @param pageName - Source page name to find similar pages for
   * @param limit - Maximum number of suggestions to return (default: 5)
   * @returns Promise resolving to array of suggested similar pages
   * @abstract
   */
  abstract suggestSimilarPages(pageName: string, limit?: number): Promise<SearchResult[]>;

  /**
   * Add or update a page in the search index
   *
   * Updates the search index with the latest content and metadata
   * for the specified page.
   *
   * @param pageName - Page name to update
   * @param pageData - Page data including content and metadata
   * @returns Promise that resolves when update is complete
   * @abstract
   */
  abstract updatePageInIndex(pageName: string, pageData: Record<string, unknown>): Promise<void>;

  /**
   * Remove a page from the search index
   *
   * Removes all entries for the specified page from the search index.
   *
   * @param pageName - Page name to remove
   * @returns Promise that resolves when removal is complete
   * @abstract
   */
  abstract removePageFromIndex(pageName: string): Promise<void>;

  /**
   * Get all unique categories from indexed documents
   *
   * Extracts and returns a list of all unique categories
   * found in the indexed pages.
   *
   * @returns Promise resolving to array of unique category names
   * @abstract
   */
  abstract getAllCategories(): Promise<string[]>;

  /**
   * Get all unique user keywords from indexed documents
   *
   * Extracts and returns a list of all unique user-defined keywords
   * found in the indexed pages.
   *
   * @returns Promise resolving to array of unique keywords
   * @abstract
   */
  abstract getAllUserKeywords(): Promise<string[]>;

  /**
   * Search by category only
   *
   * Finds all pages that belong to the specified category.
   *
   * @param category - Category name to search for
   * @returns Promise resolving to array of pages in the category
   * @abstract
   */
  abstract searchByCategory(category: string): Promise<SearchResult[]>;

  /**
   * Search by user keywords only
   *
   * Finds all pages that have the specified user keyword.
   *
   * @param keyword - Keyword to search for
   * @returns Promise resolving to array of pages with the keyword
   * @abstract
   */
  abstract searchByUserKeywords(keyword: string): Promise<SearchResult[]>;

  /**
   * Get search statistics
   *
   * Returns statistics about the search index including document count,
   * index size, last update time, and other metrics.
   *
   * @returns Promise resolving to search statistics object
   * @abstract
   */
  abstract getStatistics(): Promise<SearchStatistics>;

  /**
   * Get the total number of indexed documents
   *
   * Returns a count of how many documents are currently in the index.
   *
   * @returns Promise resolving to document count
   * @abstract
   */
  abstract getDocumentCount(): Promise<number>;

  /**
   * Check if the search provider is healthy/functional
   *
   * Performs health checks on the search backend to verify it's
   * operational and responding correctly.
   *
   * @returns Promise resolving to true if healthy, false otherwise
   * @abstract
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Close/cleanup the search provider
   *
   * Performs cleanup operations such as closing connections,
   * flushing buffers, and releasing resources.
   *
   * @returns Promise that resolves when cleanup is complete
   * @abstract
   */
  abstract close(): Promise<void>;

  /**
   * Backup search index and configuration (optional)
   *
   * Creates a backup of the search index and configuration data.
   * Default implementation provides basic metadata.
   * Subclasses should override to include actual index data.
   *
   * @returns Promise resolving to backup data object
   */
  backup(): Promise<BackupData> {
    return Promise.resolve({
      provider: this.constructor.name,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Restore search index from backup (optional)
   *
   * Restores the search index from previously created backup data.
   * Default implementation does nothing.
   * Subclasses can override if they support restore functionality.
   *
   * @param _backupData - Backup data to restore from
   * @returns Promise that resolves when restore is complete
   */
  async restore(_backupData: BackupData): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override if they support restore
  }
}

export default BaseSearchProvider;
export { WikiEngine, ProviderInfo };

