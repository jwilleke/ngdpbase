import type ICacheAdapter from './ICacheAdapter.js';
import type { CacheStats } from './ICacheAdapter.js';

/**
 * Cache set options
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttl?: number;
}

/**
 * Region cache statistics
 */
export interface RegionStats {
  /** Region name */
  region: string;
  /** Number of keys in this region */
  keys: number;
  /** Global cache statistics */
  globalStats: CacheStats;
}

/**
 * Factory function type for getOrSet
 */
export type CacheFactory<T> = () => Promise<T>;

/**
 * RegionCache - Cache wrapper that provides namespaced access to a cache adapter
 *
 * This class wraps a cache adapter and automatically prefixes all keys with a region name,
 * providing isolation between different cache users (managers, components, etc.)
 */
class RegionCache {
  private readonly adapter: ICacheAdapter;
  private readonly region: string;
  private readonly prefix: string;

  constructor(adapter: ICacheAdapter, region: string) {
    this.adapter = adapter;
    this.region = region;
    this.prefix = `${region}:`;
  }

  /**
   * Create a full key by prefixing with the region
   *
   * @param {string} key - The cache key
   * @returns {string} The prefixed key
   */
  private _getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Remove region prefix from a key
   *
   * @param {string} fullKey - The prefixed key
   * @returns {string} The key without region prefix
   */
  private _stripPrefix(fullKey: string): string {
    if (fullKey.startsWith(this.prefix)) {
      return fullKey.substring(this.prefix.length);
    }
    return fullKey;
  }

  /**
   * Get a value from the cache
   *
   * @param {string} key - The cache key
   * @returns {Promise<T|undefined>} The cached value or undefined if not found
   */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return await this.adapter.get<T>(this._getFullKey(key));
  }

  /**
   * Set a value in the cache
   *
   * @param {string} key - The cache key
   * @param {unknown} value - The value to cache
   * @param {CacheSetOptions} [options] - Cache options
   * @returns {Promise<void>}
   */
  async set(key: string, value: unknown, options: CacheSetOptions = {}): Promise<void> {
    const ttl = options.ttl;
    return await this.adapter.set(this._getFullKey(key), value, ttl);
  }

  /**
   * Delete one or more keys from the cache
   *
   * @param {string|string[]} keys - Single key or array of keys to delete
   * @returns {Promise<void>}
   */
  async del(keys: string | string[]): Promise<void> {
    if (Array.isArray(keys)) {
      const fullKeys = keys.map((key) => this._getFullKey(key));
      return await this.adapter.del(fullKeys);
    } else {
      return await this.adapter.del(this._getFullKey(keys));
    }
  }

  /**
   * Clear all cache entries for this region
   *
   * @param {string} [pattern] - Optional pattern to match keys within the region
   * @returns {Promise<void>}
   */
  async clear(pattern?: string): Promise<void> {
    if (pattern) {
      // Clear keys matching pattern within this region
      const regionPattern = `${this.prefix}${pattern}`;
      return await this.adapter.clear(regionPattern);
    } else {
      // Clear all keys in this region
      const regionPattern = `${this.prefix}*`;
      return await this.adapter.clear(regionPattern);
    }
  }

  /**
   * Get keys matching a pattern within this region
   *
   * @param {string} [pattern='*'] - Pattern to match
   * @returns {Promise<string[]>} Array of matching keys (without region prefix)
   */
  async keys(pattern: string = '*'): Promise<string[]> {
    const regionPattern = `${this.prefix}${pattern}`;
    const fullKeys = await this.adapter.keys(regionPattern);
    return fullKeys.map((key) => this._stripPrefix(key));
  }

  /**
   * Get cache statistics for this region
   *
   * @returns {Promise<RegionStats>} Cache statistics for this region
   */
  async stats(): Promise<RegionStats> {
    // Get all keys in this region
    const regionKeys = await this.adapter.keys(`${this.prefix}*`);
    const globalStats = await this.adapter.stats();

    return {
      region: this.region,
      keys: regionKeys.length,
      globalStats: globalStats
    };
  }

  /**
   * Check if a key exists in this region
   *
   * @param {string} key - The cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  /**
   * Get or set a value (cache-aside pattern)
   *
   * @param {string} key - The cache key
   * @param {CacheFactory<T>} factory - Function to generate the value if not cached
   * @param {CacheSetOptions} [options] - Cache options
   * @returns {Promise<T>} The cached or generated value
   */
  async getOrSet<T>(key: string, factory: CacheFactory<T>, options: CacheSetOptions = {}): Promise<T> {
    let value = await this.get<T>(key);

    if (value === undefined) {
      value = await factory();
      if (value !== undefined) {
        await this.set(key, value, options);
      }
    }

    return value;
  }

  /**
   * Get multiple keys at once
   *
   * @param {string[]} keys - Array of cache keys
   * @returns {Promise<Record<string, T|undefined>>} Object with keys as properties and cached values
   */
  async mget<T = unknown>(keys: string[]): Promise<Record<string, T | undefined>> {
    const results: Record<string, T | undefined> = {};

    for (const key of keys) {
      results[key] = await this.get<T>(key);
    }

    return results;
  }

  /**
   * Set multiple keys at once
   *
   * @param {Record<string, unknown>} keyValuePairs - Object with keys and values to set
   * @param {CacheSetOptions} [options] - Cache options
   * @returns {Promise<void>}
   */
  async mset(keyValuePairs: Record<string, unknown>, options: CacheSetOptions = {}): Promise<void> {
    const promises = Object.entries(keyValuePairs).map(([key, value]) => this.set(key, value, options));

    await Promise.all(promises);
  }

  /**
   * Get the region name
   *
   * @returns {string} The region name
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Get the underlying adapter
   *
   * @returns {ICacheAdapter} The cache adapter
   */
  getAdapter(): ICacheAdapter {
    return this.adapter;
  }
}

export default RegionCache;

