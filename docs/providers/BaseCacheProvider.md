---
name: BaseCacheProvider
description: Abstract cache provider interface — extension surface for cache backends (in-process, Redis, etc.)
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseCacheProvider.ts
---

# BaseCacheProvider

Abstract contract for a key/value cache with TTL support. `CacheManager` delegates `get` / `set` / `delete` / `flushAll` to the configured provider.

## Implementations

- [NodeCacheProvider](NodeCacheProvider.md) — in-process LRU (default; node-cache)
- [RedisCacheProvider](RedisCacheProvider.md) — external Redis instance
- [NullCacheProvider](NullCacheProvider.md) — no-op (caching disabled)

## Contract

- `get(key)` / `set(key, value, ttlSeconds?)` / `del(key)`
- `has(key)` / `keys()` / `flushAll()`
- `getStats()` → `CacheStats` (hits / misses / keys / memory)
- `getProviderInfo()` — diagnostics

## `CacheStats`

| Field | Description |
|---|---|
| `hits` | Cache hits |
| `misses` | Cache misses |
| `keys` | Current key count |
| `ksize`, `vsize` | Approximate key / value memory usage |
| `sets`, `deletes` | Operation counters |

## See Also

- `src/managers/CacheManager.ts` — consumer
