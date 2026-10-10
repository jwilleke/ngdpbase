import type ICacheAdapter from './ICacheAdapter.js';
import type { CacheStats } from './ICacheAdapter.js';
import CacheDependencies, { type VersionLookup } from './CacheDependencies.js';

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

/** Options for getOrSetVersioned. */
export interface VersionedSetOptions extends CacheSetOptions {
  /** Told whether the value came from the cache (true) or was computed (false); for hit/miss metrics. */
  onResult?: (hit: boolean) => void;
}

/** What getOrSetVersioned stores: the value and the versions it was built from. */
interface VersionedEntry<T> {
  __versioned: true;
  value: T;
  versions: Record<string, string>;
}

const isVersionedEntry = <T>(v: unknown): v is VersionedEntry<T> =>
  Boolean(v && typeof v === 'object' && (v as { __versioned?: unknown }).__versioned === true);

/** The two calls the read-through needs from a store. */
export interface VersionedStore {
  get<T = unknown>(key: string): Promise<T | undefined | null>;
  set(key: string, value: unknown, options?: CacheSetOptions): Promise<unknown>;
}

/**
 * Read-through with data versions (#1751), over any store with get and set.
 * Returns the stored value while every topic it was built from still has the
 * version it had then; otherwise computes it again with `factory`, stores it
 * with the versions it read (unless the render marked itself volatile), and
 * returns it. RegionCache.getOrSetVersioned is this over a region.
 */
export async function readThroughVersioned<T>(
  store: VersionedStore,
  versionOf: VersionLookup,
  key: string,
  factory: (deps: CacheDependencies) => Promise<T>,
  options: VersionedSetOptions = {}
): Promise<T> {
  const entry = await store.get<unknown>(key);
  if (isVersionedEntry<T>(entry) && await stillCurrent(versionOf, entry.versions)) {
    options.onResult?.(true);
    return entry.value;
  }

  const deps = new CacheDependencies(versionOf);
  const value = await factory(deps);
  options.onResult?.(false);
  if (value !== undefined && !deps.isVolatile()) {
    const stored: VersionedEntry<T> = { __versioned: true, value, versions: await deps.resolved() };
    await store.set(key, stored, { ttl: options.ttl });
  }
  return value;
}

async function stillCurrent(versionOf: VersionLookup, versions: Record<string, string>): Promise<boolean> {
  for (const [topic, version] of Object.entries(versions)) {
    if (await versionOf(topic) !== version) return false;
  }
  return true;
}

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
  private readonly versionOf: VersionLookup;

  /**
   * @param versionOf How to read a data topic's current version (CacheManager.version).
   *                  Without it every topic reads as version 0, so only a
   *                  volatile render or the TTL ends an entry.
   */
  constructor(adapter: ICacheAdapter, region: string, versionOf?: VersionLookup) {
    this.adapter = adapter;
    this.region = region;
    this.prefix = `${region}:`;
    this.versionOf = versionOf ?? (async () => '0');
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
   * Read-through with data versions (#1751). Returns the stored value while
   * every topic it was built from still has the version it had then;
   * otherwise computes it again with `factory`, stores it with the versions it
   * read (unless the render marked itself volatile), and returns it.
   *
   * The factory declares what it reads: `deps.dependsOn('LedgerManager')`.
   */
  async getOrSetVersioned<T>(
    key: string,
    factory: (deps: CacheDependencies) => Promise<T>,
    options: VersionedSetOptions = {}
  ): Promise<T> {
    return readThroughVersioned(this, this.versionOf, key, factory, options);
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

