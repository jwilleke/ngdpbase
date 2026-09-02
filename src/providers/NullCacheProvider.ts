import BaseCacheProvider, { CacheStats } from './BaseCacheProvider.js';
import type { ProviderInfo } from '../types/Provider.js';
import type { WikiEngine } from '../types/WikiEngine.js';

/**
 * NullCacheProvider - No-op cache provider
 *
 * Used when caching is disabled or for testing.
 * All cache operations are no-ops that return immediately.
 */
class NullCacheProvider extends BaseCacheProvider {
  constructor(engine: WikiEngine) {
    super(engine);
  }

  /**
   * Initialize the null cache provider (no-op)
   * @returns {Promise<void>}
   */
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Get provider information
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'NullCacheProvider',
      version: '1.0.0',
      description: 'No-op cache provider (caching disabled)',
      features: []
    };
  }

  /**
   * Get a value from the cache (always returns undefined)
   * @template T
   * @param {string} _key - The cache key
   * @returns {Promise<T | undefined>} Always undefined
   */
  get<T = unknown>(_key: string): Promise<T | undefined> {
    return Promise.resolve(undefined);
  }

  /**
   * Set a value in the cache (no-op)
   * @template T
   * @param {string} _key - The cache key
   * @param {T} _value - The value to cache
   * @param {number} [_ttlSec] - Time to live in seconds
   * @returns {Promise<void>}
   */
  set<T = unknown>(_key: string, _value: T, _ttlSec?: number): Promise<void> {
    // No-op
    return Promise.resolve();
  }

  /**
   * Delete one or more keys from the cache (no-op)
   * @param {string | string[]} _keys - Single key or array of keys to delete
   * @returns {Promise<void>}
   */
  del(_keys: string | string[]): Promise<void> {
    // No-op
    return Promise.resolve();
  }

  /**
   * Clear cache entries (no-op)
   * @param {string} [_pattern] - Optional pattern to match keys
   * @returns {Promise<void>}
   */
  clear(_pattern?: string): Promise<void> {
    // No-op
    return Promise.resolve();
  }

  /**
   * Get keys matching a pattern (always returns empty array)
   * @param {string} [_pattern='*'] - Pattern to match
   * @returns {Promise<string[]>} Empty array
   */
  keys(_pattern: string = '*'): Promise<string[]> {
    return Promise.resolve([] as string[]);
  }

  /**
   * Get cache statistics (all zeros)
   * @returns {Promise<CacheStats>} Cache statistics with all zeros
   */
  stats(): Promise<CacheStats> {
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

  /**
   * Check if the cache provider is healthy (always true)
   * @returns {Promise<boolean>} Always true
   */
  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Close/cleanup the cache provider (no-op)
   * @returns {Promise<void>}
   */
  close(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }
}

export default NullCacheProvider;

