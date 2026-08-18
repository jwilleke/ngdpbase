---
name: CacheManager
description: "Centralized cache facade with pluggable backends (NodeCache, Redis, Null) and named regions per consumer"
dateModified: '2026-05-14'
category: managers
code: src/managers/CacheManager.ts
---

# CacheManager

__Module:__ `src/managers/CacheManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [CacheManager-Complete-Guide.md](CacheManager-Complete-Guide.md)

---

## Overview

CacheManager provides centralized cache management for ngdpbase with pluggable cache providers, cache regions (namespaces), configurable TTL, and comprehensive statistics tracking.

> __Two cache layers in ngdpbase__: this document covers the CacheManager layer — opportunistic, TTL-based memoization through pluggable providers (NodeCache, Redis-planned, Null). It is __not__ the only caching in the system. Provider-level structural caches (e.g., `FileSystemProvider.pageCache`, `LunrSearchProvider.documents`, `ThemeManager` cache) are separate in-memory data structures populated at init and write-through invalidated; they're not exposed through CacheManager. See [the full inventory in the Complete Guide](CacheManager-Complete-Guide.md#provider-level-structural-caches) and [Access-Control.md](../architecture/Access-Control.md#performance-characteristics) for the page-access performance angle.

## Key Features

- __Pluggable Providers__ - Support for multiple backends (NodeCache, Redis, Memcached)
- __Cache Regions__ - Namespace isolation for different managers
- __Provider Fallback__ - Automatic failover to NullCacheProvider on failure
- __Health Monitoring__ - Automatic health checks with recovery
- __Statistics__ - Hit rates, miss rates, memory usage per region
- __Pattern Matching__ - Glob-style key patterns for bulk operations
- __TTL Support__ - Per-key time-to-live configuration

## Quick Example

```javascript
const cacheManager = engine.getManager('CacheManager');

// Get a cache region (namespace)
const pageCache = cacheManager.region('pages');

// Set with TTL (in seconds)
await pageCache.set('HomePage', pageData, 3600);

// Get from cache
const page = await pageCache.get('HomePage');
if (page) {
  console.log('Cache hit!');
}

// Delete specific key
await pageCache.del('HomePage');

// Clear entire region
await pageCache.clear();

// Get statistics
const stats = await pageCache.stats();
console.log('Hit rate:', stats.hitRate);
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `region(name)` | `RegionCache` | Get or create cache region |
| `get(key)` | `Promise<any>` | Get value from default region |
| `set(key, value, options)` | `Promise<void>` | Set value in default region |
| `del(keys)` | `Promise<void>` | Delete one or more keys |
| `clear(region, pattern)` | `Promise<void>` | Clear region or pattern |
| `keys(pattern)` | `Promise<string[]>` | Get keys matching pattern |
| `stats(region)` | `Promise<Object>` | Get cache statistics |
| `isHealthy()` | `Promise<boolean>` | Check provider health |
| `flushAll()` | `Promise<void>` | Clear all cache regions |

## Region Methods

```javascript
const region = cacheManager.region('pages');

// Set with TTL
await region.set('key', value, 3600);

// Get value
const value = await region.get('key');

// Delete keys
await region.del('key');
await region.del(['key1', 'key2']);

// Clear region
await region.clear();

// Get statistics
const stats = await region.stats();
```

## Set Options

```javascript
await cacheManager.set('key', value, {
  ttl: 3600,              // Time-to-live in seconds
  region: 'pages',        // Target region (optional)
  tags: ['user', 'edit']  // Tags for bulk invalidation (future)
});
```

## Statistics Object

```javascript
{
  hits: 150,          // Cache hits
  misses: 50,         // Cache misses
  hitRate: 0.75,      // Hit rate (hits / total)
  keys: 100,          // Number of keys
  size: 1024000,      // Memory usage in bytes (provider-dependent)
  ttl: 300            // Default TTL for region
}
```

## Configuration

```json
{
  "ngdpbase.cache.enabled": true,
  "ngdpbase.cache.provider.default": "nodecacheprovider",
  "ngdpbase.cache.provider": "nodecacheprovider",
  "ngdpbase.cache.defaultttl": 300,
  "ngdpbase.cache.maxkeys": 1000,
  "ngdpbase.cache.checkperiod": 120
}
```

## Available Providers

| Provider | Status | Description |
| ---------- | -------- | ------------- |
| `NodeCacheProvider` | ✅ Production | In-memory cache (single server) |
| `NullCacheProvider` | ✅ Production | No-op cache (for testing/disabled) |
| `RedisCacheProvider` | 🔮 Planned | Distributed cache via Redis |
| `MemcachedProvider` | 🔮 Planned | Distributed cache via Memcached |

## Common Cache Regions

| Region | Used By | TTL | Description |
| -------- | --------- | ----- | ------------- |
| `pages` | PageManager | 3600 | Rendered page content |
| `users` | UserManager | 1800 | User session data |
| `search` | SearchManager | 600 | Search results |
| `metadata` | PageManager | 7200 | Page metadata |
| `permissions` | ACLManager | 900 | Permission checks |
| `plugins` | PluginManager | 3600 | Plugin output |

## Pattern Matching

```javascript
// Get all page keys
const pageKeys = await cacheManager.keys('pages:*');

// Clear all user session caches
await cacheManager.clear('users', 'session:*');

// Delete specific pattern
await cacheManager.del('temp:*');
```

## Health Monitoring

```javascript
// Check provider health
const healthy = await cacheManager.isHealthy();
if (!healthy) {
  console.warn('Cache provider unhealthy, using fallback');
}

// Get provider info
const config = cacheManager.getConfig();
console.log('Provider:', config.provider);
console.log('Features:', config.features);
```

## Best Practices

1. __Use Regions__: Isolate caches by manager/purpose
2. __Set Appropriate TTL__: Balance freshness vs performance
3. __Monitor Hit Rates__: Track cache effectiveness
4. __Clear on Updates__: Invalidate cache when data changes
5. __Test Without Cache__: Use NullCacheProvider for testing

## Example: PageManager Integration

```javascript
class PageManager extends BaseManager {
  async getPage(identifier) {
    const cacheManager = this.engine.getManager('CacheManager');
    const cache = cacheManager.region('pages');

    // Try cache first
    const cached = await cache.get(identifier);
    if (cached) return cached;

    // Cache miss, load from storage
    const page = await this.provider.getPage(identifier);

    // Store in cache for 1 hour
    await cache.set(identifier, page, 3600);

    return page;
  }

  async savePage(name, content, metadata) {
    // Save to storage
    await this.provider.savePage(name, content, metadata);

    // Invalidate cache
    const cache = this.engine.getManager('CacheManager').region('pages');
    await cache.del(name);
  }
}
```

## Disabling Cache

```json
{
  "ngdpbase.cache.enabled": false
}
```

When disabled, CacheManager automatically loads NullCacheProvider (no-op).

## Admin API

CacheManager regions are exposed via REST endpoints (admin-only). Provider-level structural caches are __not__ affected by these.

| Endpoint | Effect |
| --- | --- |
| `GET /api/admin/cache/stats` | Returns global + per-region hit/miss/keys/config |
| `POST /api/admin/cache/clear` | Clears all CacheManager regions |
| `POST /api/admin/cache/clear/:region` | Clears one region (e.g., `RenderingManager`) |

Both `clear` endpoints require `admin-system` permission and a valid CSRF token. See [CacheManager-Complete-Guide.md § Admin API](CacheManager-Complete-Guide.md#admin-api) for response shape and examples.

## Related Documentation

- [CacheManager-Complete-Guide.md](CacheManager-Complete-Guide.md) — full provider architecture, all regions, admin API, provider-level structural caches inventory
- [ConfigurationManager](ConfigurationManager.md) — cache configuration loader
- [PageManager](PageManager.md) — uses both CacheManager regions and provider-level structural caches
- [UserManager](UserManager.md) — user session caching
- [SearchManager](SearchManager.md) — search result caching (separate from search-provider-level indexed documents)
- [Access-Control.md](../architecture/Access-Control.md#performance-characteristics) — how the two cache layers affect access-check performance
- [WikiContext-Complete-Guide.md](../WikiContext-Complete-Guide.md#lazy-theme-resolution-v360) — engine-wide ThemeManager cache (provider-level)
- [Current-Rendering-Pipeline.md](../architecture/Current-Rendering-Pipeline.md#caching) — MarkupParser parse-result cache
