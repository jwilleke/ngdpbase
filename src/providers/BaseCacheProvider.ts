import type { WikiEngine } from '../types/WikiEngine.js';
import BaseProvider from './BaseProvider.js';

/**
 * Cache statistics structure
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of keys in cache */
  keys: number;
  /** Approximate memory usage of keys */
  ksize: number;
  /** Approximate memory usage of values */
  vsize: number;
  /** Number of set operations */
  sets: number;
  /** Number of delete operations */
  deletes: number;
  /** Cache hit rate percentage */
  hitRate: number;
}

/**
 * Provider information
 */
export interface ProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
}

/**
 * Backup data structure
 */
export interface BackupData {
  provider: string;
  initialized: boolean;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * BaseCacheProvider - Base class for all cache providers
 *
 * Provides the interface that all cache providers must implement.
 * Follows the provider pattern established in AttachmentManager and PageManager.
 *
 * Cache providers implement different storage backends (node-cache, Redis, etc.)
 *
 * @class BaseCacheProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link NodeCacheProvider} for in-memory implementation
 * @see {@link RedisCacheProvider} for Redis implementation
 * @see {@link CacheManager} for usage
 */
abstract class BaseCacheProvider extends BaseProvider {
  /**
   * Reference to the wiki engine instance
   */
  protected engine: WikiEngine;

  /**
   * Whether the provider has been initialized
   */
  protected initialized: boolean;

  /**
   * Creates a new cache provider
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super();
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the cache provider
   * Implementations should load configuration from ConfigurationManager
   * @returns {Promise<void>}
   */
  abstract initialize(): Promise<void>;

  /**
   * Get provider information
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BaseCacheProvider',
      version: '1.0.0',
      description: 'Base cache provider interface',
      features: []
    };
  }

  /**
   * Get a value from the cache
   * @template T
   * @param {string} key - The cache key
   * @returns {Promise<T | undefined>} The cached value or undefined if not found
   */
  abstract get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Set a value in the cache
   * @template T
   * @param {string} key - The cache key
   * @param {T} value - The value to cache
   * @param {number} [ttlSec] - Time to live in seconds
   * @returns {Promise<void>}
   */
  abstract set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void>;

  /**
   * Delete one or more keys from the cache
   * @param {string | string[]} keys - Single key or array of keys to delete
   * @returns {Promise<void>}
   */
  abstract del(keys: string | string[]): Promise<void>;

  /**
   * Clear cache entries
   * @param {string} [pattern] - Optional pattern to match keys (e.g., 'user:*')
   * @returns {Promise<void>}
   */
  abstract clear(pattern?: string): Promise<void>;

  /**
   * Get keys matching a pattern
   * @param {string} [pattern='*'] - Pattern to match (e.g., 'user:*' or '*' for all)
   * @returns {Promise<string[]>} Array of matching keys
   */
  abstract keys(pattern?: string): Promise<string[]>;

  /**
   * Get cache statistics
   * @returns {Promise<CacheStats>} Cache statistics
   */
  abstract stats(): Promise<CacheStats>;

  /**
   * Check if the cache provider is healthy/connected
   * @returns {Promise<boolean>} True if healthy
   */
  abstract isHealthy(): Promise<boolean>;

  /**
   * Close/cleanup the cache provider
   * @returns {Promise<void>}
   */
  abstract close(): Promise<void>;

  /**
   * Backup cache configuration and state (optional)
   * @returns {Promise<BackupData>} Backup data
   */
  backup(): Promise<BackupData> {
    return Promise.resolve({
      provider: this.constructor.name,
      initialized: this.initialized,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Restore cache from backup (optional)
   * @param {BackupData} _backupData - Backup data
   * @returns {Promise<void>}
   */
  async restore(_backupData: BackupData): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override if they support restore
  }
}

export default BaseCacheProvider;

