import BaseCacheProvider, { CacheStats, ProviderInfo, BackupData } from './BaseCacheProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

/**
 * NodeCache configuration interface
 */
interface NodeCacheConfig {
  stdTTL: number;
  checkperiod: number;
  useClones: boolean;
  deleteOnExpire: boolean;
  maxKeys: number;
}

/**
 * Cache statistics tracking
 */
interface CacheStatistics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
}

/**
 * Extended backup data for NodeCacheProvider
 */
interface NodeCacheBackupData extends BackupData {
  config: NodeCacheConfig;
  statistics: CacheStatistics;
  keyCount: number;
}

/**
 * NodeCacheProvider - In-memory cache provider using node-cache
 *
 * Provides high-performance in-memory caching with TTL support.
 * Suitable for single-instance deployments and development.
 *
 * Configuration keys (all lowercase):
 * - ngdpbase.cache.provider.nodecache.stdttl - Default TTL in seconds
 * - ngdpbase.cache.provider.nodecache.checkperiod - Check for expired keys interval
 * - ngdpbase.cache.provider.nodecache.maxkeys - Maximum number of keys
 * - ngdpbase.cache.provider.nodecache.useclones - Whether to clone objects
 */
class NodeCacheProvider extends BaseCacheProvider {
  private cache: NodeCache | null;
  private config: NodeCacheConfig | null;
  private statistics: CacheStatistics;

  constructor(engine: WikiEngine) {
    super(engine);
    this.cache = null;
    this.config = null;
    this.statistics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  /**
   * Initialize the NodeCache provider
   * Loads configuration from ConfigurationManager
   * @returns {Promise<void>}
   */
  initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      return Promise.reject(new Error('NodeCacheProvider requires ConfigurationManager'));
    }

    // Load provider-specific settings (ALL LOWERCASE)
    const stdTTL = configManager.getProperty(
      'ngdpbase.cache.provider.nodecache.stdttl',
      300
    ) as number;
    const checkperiod = configManager.getProperty(
      'ngdpbase.cache.provider.nodecache.checkperiod',
      120
    ) as number;
    const maxKeys = configManager.getProperty(
      'ngdpbase.cache.provider.nodecache.maxkeys',
      1000
    ) as number;
    const useClones = configManager.getProperty(
      'ngdpbase.cache.provider.nodecache.useclones',
      true
    ) as boolean;

    this.config = {
      stdTTL: stdTTL,
      checkperiod: checkperiod,
      useClones: useClones,
      deleteOnExpire: true,
      maxKeys: maxKeys
    };

    // Create NodeCache instance
    this.cache = new NodeCache(this.config);

    // Set up event listeners for statistics
    this.cache.on('hit', () => {
      this.statistics.hits++;
    });

    this.cache.on('miss', () => {
      this.statistics.misses++;
    });

    this.cache.on('set', () => {
      this.statistics.sets++;
    });

    this.cache.on('del', () => {
      this.statistics.deletes++;
    });

    this.initialized = true;

    logger.info(`[NodeCacheProvider] Initialized with maxKeys=${maxKeys}, stdTTL=${stdTTL}s`);
    return Promise.resolve();
  }

  /**
   * Get provider information
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'NodeCacheProvider',
      version: '1.0.0',
      description: 'In-memory cache provider using node-cache',
      features: ['ttl', 'patterns', 'statistics', 'local-memory']
    };
  }

  /**
   * Get a value from the cache
   * @template T
   * @param {string} key - The cache key
   * @returns {Promise<T | undefined>} The cached value or undefined if not found
   */
  get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      if (!this.cache) {
        return Promise.resolve(undefined);
      }
      const value = this.cache.get<T>(key);
      return Promise.resolve(value);
    } catch (error) {
      logger.error('[NodeCacheProvider] Get error:', error);
      return Promise.resolve(undefined);
    }
  }

  /**
   * Set a value in the cache
   * @template T
   * @param {string} key - The cache key
   * @param {T} value - The value to cache
   * @param {number} [ttlSec] - Time to live in seconds
   * @returns {Promise<void>}
   */
  set<T = unknown>(key: string, value: T, ttlSec?: number): Promise<void> {
    try {
      if (!this.cache) {
        throw new Error('NodeCacheProvider not initialized');
      }
      if (ttlSec !== undefined) {
        this.cache.set(key, value, ttlSec);
      } else {
        this.cache.set(key, value);
      }
      return Promise.resolve();
    } catch (error) {
      logger.error('[NodeCacheProvider] Set error:', error);
      throw error;
    }
  }

  /**
   * Delete one or more keys from the cache
   * @param {string | string[]} keys - Single key or array of keys to delete
   * @returns {Promise<void>}
   */
  del(keys: string | string[]): Promise<void> {
    try {
      if (!this.cache) {
        return Promise.resolve();
      }
      if (Array.isArray(keys)) {
        this.cache.del(keys);
      } else {
        this.cache.del(keys);
      }
      return Promise.resolve();
    } catch (error) {
      logger.error('[NodeCacheProvider] Delete error:', error);
      throw error;
    }
  }

  /**
   * Clear cache entries
   * @param {string} [pattern] - Optional pattern to match keys (e.g., 'user:*')
   * @returns {Promise<void>}
   */
  async clear(pattern?: string): Promise<void> {
    try {
      if (!this.cache) {
        return;
      }
      if (!pattern || pattern === '*') {
        // Clear all keys
        this.cache.flushAll();
      } else {
        // Clear keys matching pattern
        const keys = await this.keys(pattern);
        if (keys.length > 0) {
          this.cache.del(keys);
        }
      }
    } catch (error) {
      logger.error('[NodeCacheProvider] Clear error:', error);
      throw error;
    }
  }

  /**
   * Get keys matching a pattern
   * @param {string} [pattern='*'] - Pattern to match (e.g., 'user:*' or '*' for all)
   * @returns {Promise<string[]>} Array of matching keys
   */
  keys(pattern: string = '*'): Promise<string[]> {
    try {
      if (!this.cache) {
        return Promise.resolve([]);
      }
      const allKeys = this.cache.keys();

      if (pattern === '*') {
        return Promise.resolve(allKeys);
      }

      // Simple pattern matching - convert glob-style pattern to regex
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`);

      return Promise.resolve(allKeys.filter((key: string) => regex.test(key)));
    } catch (error) {
      logger.error('[NodeCacheProvider] Keys error:', error);
      return Promise.resolve([] as string[]);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<CacheStats>} Cache statistics
   */
  stats(): Promise<CacheStats> {
    try {
      if (!this.cache) {
        return Promise.resolve({
          hits: 0,
          misses: 0,
          keys: 0,
          ksize: 0,
          vsize: 0,
          sets: 0,
          deletes: 0,
          hitRate: 0
        });
      }
      const nodeStats = this.cache.getStats();

      return Promise.resolve({
        hits: this.statistics.hits,
        misses: this.statistics.misses,
        keys: nodeStats.keys,
        ksize: nodeStats.ksize,
        vsize: nodeStats.vsize,
        sets: this.statistics.sets,
        deletes: this.statistics.deletes,
        hitRate: this.statistics.hits + this.statistics.misses > 0
          ? (this.statistics.hits / (this.statistics.hits + this.statistics.misses)) * 100
          : 0
      });
    } catch (error) {
      logger.error('[NodeCacheProvider] Stats error:', error);
      return Promise.resolve({
        hits: 0,
        misses: 0,
        keys: 0,
        ksize: 0,
        vsize: 0,
        sets: 0,
        deletes: 0,
        hitRate: 0
      });
    }
  }

  /**
   * Check if the cache provider is healthy/connected
   * @returns {Promise<boolean>} True if healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Test basic functionality
      const testKey = '__health_check__';
      await this.set(testKey, 'test', 1);
      const value = await this.get<string>(testKey);
      await this.del(testKey);
      return value === 'test';
    } catch (error) {
      logger.error('[NodeCacheProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Close/cleanup the cache provider
   * @returns {Promise<void>}
   */
  close(): Promise<void> {
    try {
      if (this.cache) {
        this.cache.close();
        this.cache = null;
      }
      this.initialized = false;
      logger.info('[NodeCacheProvider] Closed successfully');
      return Promise.resolve();
    } catch (error) {
      logger.error('[NodeCacheProvider] Close error:', error);
      return Promise.resolve();
    }
  }

  /**
   * Backup cache configuration and statistics
   * @returns {Promise<NodeCacheBackupData>} Backup data
   */
  async backup(): Promise<NodeCacheBackupData> {
    const baseBackup = await super.backup();
    const defaultConfig: NodeCacheConfig = {
      stdTTL: 300,
      checkperiod: 120,
      useClones: true,
      deleteOnExpire: true,
      maxKeys: 1000
    };
    return {
      ...baseBackup,
      config: this.config ? { ...this.config } : defaultConfig,
      statistics: { ...this.statistics },
      keyCount: this.cache ? this.cache.keys().length : 0
    };
  }

  /**
   * Get the underlying node-cache instance (for advanced usage)
   * @returns {NodeCache | null} The node-cache instance
   */
  getNodeCache(): NodeCache | null {
    return this.cache;
  }
}

export default NodeCacheProvider;

