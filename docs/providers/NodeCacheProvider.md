---
name: NodeCacheProvider
description: In-process LRU cache (powered by node-cache) — default backend for CacheManager
dateModified: '2026-05-28'
category: providers
code: src/providers/NodeCacheProvider.ts
---

# NodeCacheProvider

Default cache backend. Uses the `node-cache` package — an in-process LRU + TTL cache. Lives in the Node process memory; perfect for single-process deployments and the common case where cache invalidation across instances isn't required.

## Configuration

- `ngdpbase.cache.provider` = `node-cache` (default)
- `ngdpbase.cache.default-ttl` — default TTL in seconds
- `ngdpbase.cache.max-keys` — soft cap on keys

## Trade-offs vs siblings

| Provider | When |
|---|---|
| __NodeCacheProvider__ | Single-instance / small-medium deployments — in-process is fastest |
| [RedisCacheProvider](RedisCacheProvider.md) | Multi-instance / shared cache across processes |
| [NullCacheProvider](NullCacheProvider.md) | Caching disabled (tests, debugging) |

## See Also

- [BaseCacheProvider](BaseCacheProvider.md) — the contract
- `src/managers/CacheManager.ts` — consumer
