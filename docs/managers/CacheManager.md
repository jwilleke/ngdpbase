---
name: CacheManager
description: "Centralized cache facade with pluggable backends (NodeCache, Redis, Null) and named regions per consumer"
dateModified: '2026-10-11'
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
>
> __What uses it today__: only the markup parser, through one region: the page cache `MarkupParser-ParseResults` (its handler-results, patterns and variables regions were removed in #1751). The page cache is keyed by the viewer and their roles and follows the data each render read through data versions ([caching-developer-guide.md](../guides/caching-developer-guide.md), #1751).

## Key Features

- __Pluggable Providers__ - NodeCache and Null backends (a Redis provider is stubbed)
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

## Read-Through with Data Versions (#1751)

A cached value built from a manager's data stays current without guessing a TTL.
The manager names its data with a __topic__ (by convention its own name, such as
`LedgerManager`) and bumps it after every write. A read-through entry remembers the
version of each topic it read, and is served only while those versions are unchanged.

```javascript
// The manager, at its one write door:
await cacheManager.bump('LedgerManager');

// A reader:
const html = await cacheManager.region('pages').getOrSetVersioned('Ledger', async (deps) => {
  deps.dependsOn('LedgerManager');      // declare before reading
  return renderBalances();
});
```

- `version(topic)` is `'0'` until the topic is first bumped. Versions never expire, and each
  bump is a new unique value, so instances sharing a cache can't collide on a count.
- `CLOCK_TOPIC` (`'Clock'`) is a topic nobody writes: its version is the current minute.
  A render whose output drifts with time (a clock to the minute, an uptime) depends on it
  and is re-rendered at most once a minute.
- Only a render whose output differs on every request (a clock showing seconds, a counter)
  calls `deps.markVolatile()`. It is returned but never stored.
- The page cache (`MarkupParser-ParseResults`) reads through this way, and is the only page
  cache. Every render depends on `PageManager`, `ConfigurationManager` and `UserManager`;
  each manager a plugin fetches is recorded too. See
  [caching-developer-guide.md](../guides/caching-developer-guide.md).

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
| `RedisCacheProvider` | 🔮 Stub | Class exists and is selectable, but its methods are not implemented |
| `MemcachedProvider` | 🔮 Planned | Distributed cache via Memcached |

## Cache Regions in Use

| Region | Used By | TTL | Description |
| -------- | --------- | ----- | ------------- |
| `MarkupParser-ParseResults` | MarkupParser | `ngdpbase.markup.cache.parse-results.ttl` (300) | The one page cache: rendered page HTML, read through with data versions ([caching-developer-guide.md](../guides/caching-developer-guide.md)) |

No other region is created today. Earlier versions of this page listed `pages`, `users`, `search`, `metadata`, `permissions` and `plugins`; nothing creates them.

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
| `POST /api/admin/cache/clear/page/:identifier` | Evicts one page from the provider content cache and bumps the page-data version, so cached renders re-render |
| `POST /api/admin/cache/clear/:region` | Clears one region (e.g., `MarkupParser-ParseResults`) |

All three `clear` endpoints require `admin-system` permission and a valid CSRF token. See [CacheManager-Complete-Guide.md § Admin API](CacheManager-Complete-Guide.md#admin-api) for response shape and examples.

## Related Documentation

- [CacheManager-Complete-Guide.md](CacheManager-Complete-Guide.md) — full provider architecture, all regions, admin API, provider-level structural caches inventory
- [ConfigurationManager](ConfigurationManager.md) — cache configuration loader
- [PageManager](PageManager.md) — bumps the page-data topic after every page change; its provider keeps a provider-level structural cache
- [UserManager](UserManager.md) — bumps the account-data topic after every account write
- [Access-Control.md](../architecture/Access-Control.md#performance-characteristics) — how the two cache layers affect access-check performance
- [WikiContext-Complete-Guide.md](../WikiContext-Complete-Guide.md#lazy-theme-resolution-v360) — engine-wide ThemeManager cache (provider-level)
- [Current-Rendering-Pipeline.md](../architecture/Current-Rendering-Pipeline.md#caching) — MarkupParser parse-result cache
