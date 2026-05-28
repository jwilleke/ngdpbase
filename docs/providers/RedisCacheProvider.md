---
name: RedisCacheProvider
description: External Redis-backed cache — shared across multiple ngdpbase instances
dateModified: '2026-05-28'
category: providers
code: src/providers/RedisCacheProvider.ts
---

# RedisCacheProvider

External Redis-backed cache. Use when you have multiple ngdpbase instances sharing the same cache namespace, or when you want cache persistence across process restarts.

## Configuration

- `ngdpbase.cache.provider` = `redis`
- `ngdpbase.cache.redis.url` — Redis connection URL (e.g. `redis://localhost:6379/0`)
- `ngdpbase.cache.redis.key-prefix` — namespace prefix (avoids collisions when sharing Redis)
- `ngdpbase.cache.default-ttl` — default TTL in seconds

## See Also

- [BaseCacheProvider](BaseCacheProvider.md) — the contract
- [NodeCacheProvider](NodeCacheProvider.md), [NullCacheProvider](NullCacheProvider.md) — sibling backends
- `src/managers/CacheManager.ts` — consumer
