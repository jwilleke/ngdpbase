import BaseManager from './BaseManager.js';
import RegionCache from '../cache/RegionCache.js';
import type ICacheAdapter from '../cache/ICacheAdapter.js';
import logger from '../utils/logger.js';
import NullCacheProvider from '../providers/NullCacheProvider.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';

/**
 * Cache options for set operations
 */
export interface CacheOptions {
  ttl?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  provider: string | null;
  defaultTTL: number;
  maxKeys: number;
  checkPeriod: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  global?: unknown;
  regions?: string[];
  provider?: string | null;
  config?: CacheConfig;
  [key: string]: unknown;
}

/**
 * Base cache provider interface
 */
interface BaseCacheProvider {
  initialize(): Promise<void>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  del(keys: string | string[]): Promise<void>;
  clear(pattern?: string): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
  stats(): Promise<unknown>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
  getProviderInfo(): { features?: string[] };
}

/**
 * CacheManager - Centralized cache management for ngdpbase
 *
 * Provides a unified interface for caching across all managers with support for:
 * - Multiple cache backends via provider pattern (NodeCache, Redis, Null)
 * - Cache regions (namespaces) for different managers
 * - Configurable TTL and cache policies
 * - Statistics and monitoring
 * - Provider fallback pattern following #102, #104, #105, #106
 *
 * Configuration (all lowercase):
 * - ngdpbase.cache.enabled - Enable/disable caching
 * - ngdpbase.cache.provider.default - Default provider name
 * - ngdpbase.cache.provider - Active provider name
 * - ngdpbase.cache.defaultttl - Default TTL in seconds
 * - ngdpbase.cache.maxkeys - Maximum cache keys
 *
 * @class CacheManager
 * @extends BaseManager
 *
 * @property {BaseCacheProvider|null} provider - The active cache provider
 * @property {string|null} providerClass - The class name of the loaded provider
 * @property {Map<string, RegionCache>} regions - Cache regions by name
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const cacheManager = engine.getManager('CacheManager');
 * const region = cacheManager.getRegion('pages');
 * region.set('Main', pageData, 3600);
 */
/** Where data-topic versions are kept, beside the regions (#1751). */
const VERSION_PREFIX = 'cache-version:';

class CacheManager extends BaseManager {
  private provider: BaseCacheProvider | null;
  private providerClass: string | null;
  private regions: Map<string, RegionCache>;
  private defaultTTL!: number;
  private maxKeys!: number;
  private checkPeriod!: number;

  /**
   * Creates a new CacheManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.provider = null;
    this.providerClass = null;
    this.regions = new Map();
  }

  /**
   * Initialize the CacheManager and load the configured provider
   *
   * @async
   * @param {Record<string, unknown>} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   * @throws {Error} If ConfigurationManager is not available
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('CacheManager requires ConfigurationManager');
    }

    // Check if cache is enabled (ALL LOWERCASE)
    const cacheEnabled = configManager.getProperty('ngdpbase.cache.enabled', true) as boolean;
    if (!cacheEnabled) {
      logger.info('🗄️  CacheManager: Caching disabled by configuration');
      // Load NullCacheProvider when disabled
      this.providerClass = 'NullCacheProvider';
      await this.loadProvider();
      return;
    }

    // Load provider with fallback (ALL LOWERCASE)
    const defaultProvider = configManager.getProperty('ngdpbase.cache.provider.default', 'nodecacheprovider') as string;
    const providerName = configManager.getProperty('ngdpbase.cache.provider', defaultProvider) as string;

    // Normalize provider name to PascalCase for class loading
    // nodecacheprovider -> NodeCacheProvider
    this.providerClass = this.normalizeProviderName(providerName);

    // Load shared cache settings (ALL LOWERCASE)
    this.defaultTTL = configManager.getProperty('ngdpbase.cache.defaultttl', 300) as number;
    this.maxKeys = configManager.getProperty('ngdpbase.cache.maxkeys', 1000) as number;
    this.checkPeriod = configManager.getProperty('ngdpbase.cache.checkperiod', 120) as number;

    logger.info(`🗄️  Loading cache provider: ${providerName} (${this.providerClass})`);

    // Load and initialize provider
    await this.loadProvider();

    logger.info(`🗄️  CacheManager initialized with ${this.providerClass}`);
    logger.info(`🗄️  Cache settings - TTL: ${this.defaultTTL}s, MaxKeys: ${this.maxKeys}`);

    if (this.provider) {
      const providerInfo = this.provider.getProviderInfo();
      if (providerInfo.features && providerInfo.features.length > 0) {
        logger.info(`🗄️  Provider features: ${providerInfo.features.join(', ')}`);
      }
    }
  }

  /**
   * Load the cache provider dynamically
   * @private
   * @returns {Promise<void>}
   */
  private async loadProvider(): Promise<void> {
    try {
      // Try to load provider class
      type CacheProviderConstructor = new (engine: WikiEngine) => BaseCacheProvider;
      const mod = await import(/* @vite-ignore */ `../providers/${this.providerClass}.js`) as { default: CacheProviderConstructor };
      this.provider = new mod.default(this.engine);
      await this.provider.initialize();

      // Test provider health
      const isHealthy = await this.provider.isHealthy();
      if (!isHealthy) {
        logger.warn(`Cache provider ${this.providerClass} health check failed, switching to NullCacheProvider`);

        this.provider = new NullCacheProvider(this.engine);
        await this.provider.initialize();
      }
    } catch (error) {
      logger.error(`Failed to load cache provider: ${this.providerClass}`, error);
      // Fall back to NullCacheProvider on any error
      logger.warn('Falling back to NullCacheProvider due to provider load error');

      this.provider = new NullCacheProvider(this.engine);
      await this.provider.initialize();
    }
  }

  /**
   * Normalize provider name to PascalCase class name
   * @param {string} providerName - Lowercase provider name (e.g., 'nodecacheprovider')
   * @returns {string} PascalCase class name (e.g., 'NodeCacheProvider')
   * @private
   */
  private normalizeProviderName(providerName: string): string {
    if (!providerName) {
      throw new Error('Provider name cannot be empty');
    }

    // Convert to lowercase first to ensure consistency
    const lower = providerName.toLowerCase();

    // Handle special cases for known provider names
    const knownProviders: Record<string, string> = {
      nodecacheprovider: 'NodeCacheProvider',
      rediscacheprovider: 'RedisCacheProvider',
      nullcacheprovider: 'NullCacheProvider',
      null: 'NullCacheProvider',
      disabled: 'NullCacheProvider'
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
   * Get a cache region for a specific namespace
   * @param {string} region - Region name (typically manager name)
   * @returns {RegionCache} Cache instance scoped to the region
   */
  region(region: string): RegionCache {
    if (!this.regions.has(region)) {
      this.regions.set(region, new RegionCache(this.provider as unknown as ICacheAdapter, region, (topic) => this.version(topic)));
    }
    return this.regions.get(region) ?? new RegionCache(this.provider as unknown as ICacheAdapter, region, (topic) => this.version(topic));
  }

  // ── Data versions (#1751) ──────────────────────────────────────────────

  /**
   * The current version of a data topic: by convention a manager's name
   * (`LedgerManager`). A cached render built from the topic is served only
   * while this is unchanged (`RegionCache.getOrSetVersioned`). `'0'` until
   * the topic is first bumped.
   */
  async version(topic: string): Promise<string> {
    if (!this.provider) return '0';
    const value = await this.provider.get(`${VERSION_PREFIX}${topic}`);
    return typeof value === 'string' ? value : '0';
  }

  /**
   * Say that a topic's data changed: every cached render that read it is
   * re-rendered on its next read. A manager calls this after each write, at
   * its one door. Versions never expire (TTL 0); each bump is a new unique
   * value, so two instances sharing a cache cannot collide on a count.
   */
  async bump(topic: string): Promise<string> {
    const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    if (!this.provider) return version;
    try {
      await this.provider.set(`${VERSION_PREFIX}${topic}`, version, 0);
    } catch (error) {
      logger.warn(`🗄️  CacheManager: could not bump '${topic}'; renders that read it may stay stale until their TTL`, error);
    }
    return version;
  }

  /**
   * Get a value from the cache (global scope)
   * @param {string} key - The cache key
   * @returns {Promise<unknown>} The cached value or undefined if not found
   */
  async get(key: string): Promise<unknown> {
    if (!this.provider) {
      throw new Error('Cache provider not initialized');
    }
    return await this.provider.get(key);
  }

  /**
   * Set a value in the cache (global scope)
   * @param {string} key - The cache key
   * @param {unknown} value - The value to cache
   * @param {CacheOptions} [options] - Cache options
   * @param {number} [options.ttl] - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key: string, value: unknown, options: CacheOptions = {}): Promise<void> {
    if (!this.provider) {
      throw new Error('Cache provider not initialized');
    }
    const ttl = options.ttl || this.defaultTTL;
    return await this.provider.set(key, value, ttl);
  }

  /**
   * Delete one or more keys from the cache
   * @param {string|string[]} keys - Single key or array of keys to delete
   * @returns {Promise<void>}
   */
  async del(keys: string | string[]): Promise<void> {
    if (!this.provider) {
      throw new Error('Cache provider not initialized');
    }
    return await this.provider.del(keys);
  }

  /**
   * Clear cache entries
   * @param {string} [region] - Optional region to clear (if not specified, clears all)
   * @param {string} [pattern] - Optional pattern to match keys
   * @returns {Promise<void>}
   */
  async clear(region?: string, pattern?: string): Promise<void> {
    if (region) {
      const regionCache = this.region(region);
      return await regionCache.clear(pattern);
    } else {
      if (!this.provider) {
        throw new Error('Cache provider not initialized');
      }
      return await this.provider.clear(pattern);
    }
  }

  /**
   * Get keys matching a pattern
   * @param {string} [pattern='*'] - Pattern to match
   * @returns {Promise<string[]>} Array of matching keys
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    if (!this.provider) {
      throw new Error('Cache provider not initialized');
    }
    return await this.provider.keys(pattern);
  }

  /**
   * Get cache statistics
   * @param {string} [region] - Optional region to get stats for
   * @returns {Promise<CacheStats>} Cache statistics
   */
  async stats(region?: string): Promise<CacheStats> {
    if (region) {
      const regionCache = this.region(region);
      return (await regionCache.stats()) as unknown as CacheStats;
    } else {
      if (!this.provider) {
        throw new Error('Cache provider not initialized');
      }
      const globalStats = await this.provider.stats();
      const regions = Array.from(this.regions.keys());

      return {
        global: globalStats,
        regions: regions,
        provider: this.providerClass,
        config: {
          provider: this.providerClass,
          defaultTTL: this.defaultTTL,
          maxKeys: this.maxKeys,
          checkPeriod: this.checkPeriod
        }
      };
    }
  }

  /**
   * Check if the cache is healthy
   * @returns {Promise<boolean>} True if cache is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.provider) {
      return false;
    }
    return await this.provider.isHealthy();
  }

  /**
   * Get cache configuration
   * @returns {CacheConfig} Cache configuration
   */
  getConfig(): CacheConfig {
    return {
      provider: this.providerClass,
      defaultTTL: this.defaultTTL,
      maxKeys: this.maxKeys,
      checkPeriod: this.checkPeriod
    };
  }

  /**
   * Get all active regions
   * @returns {string[]} Array of region names
   */
  getRegions(): string[] {
    return Array.from(this.regions.keys());
  }

  /**
   * Flush all caches (dangerous operation)
   * @returns {Promise<void>}
   */
  async flushAll(): Promise<void> {
    logger.warn('CacheManager.flushAll() - clearing ALL cache data');
    if (this.provider) {
      await this.provider.clear('*');
    }
    this.regions.clear();
  }

  /**
   * Close and cleanup cache resources
   * @returns {Promise<void>}
   */
  async shutdown(): Promise<void> {
    logger.info('🗄️  CacheManager shutting down...');

    if (this.provider) {
      await this.provider.close();
      this.provider = null;
    }

    this.regions.clear();

    await super.shutdown();
  }

  /**
   * Helper method to add cache support to BaseManager
   * Can be called from any manager to get a cache region
   * @param {any} engine - WikiEngine instance
   * @param {string} [region] - Region name (defaults to calling class name)
   * @returns {RegionCache} Cache instance scoped to the region
   */
  static getCacheForManager(engine: WikiEngine, region?: string): RegionCache {
    const cacheManager = engine.getManager<CacheManager>('CacheManager');
    if (!cacheManager || !cacheManager.isInitialized()) {
      // Return a null cache if CacheManager not available
      const nullProvider = new NullCacheProvider(engine);
      return new RegionCache(nullProvider, region || 'default');
    }
    return cacheManager.region(region || 'default');
  }
}

export default CacheManager;

