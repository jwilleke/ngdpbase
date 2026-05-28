---
name: NullCacheProvider
description: No-op cache — every get is a miss; every set is discarded
dateModified: '2026-05-28'
category: providers
code: src/providers/NullCacheProvider.ts
---

# NullCacheProvider

No-op cache. `get` always returns undefined; `set` / `del` / `flushAll` are silent no-ops. Use when you want to deliberately disable caching (debugging stale-data issues, test isolation, minimal deployments).

## Configuration

- `ngdpbase.cache.provider` = `null`

## See Also

- [BaseCacheProvider](BaseCacheProvider.md) — the contract
- [NodeCacheProvider](NodeCacheProvider.md), [RedisCacheProvider](RedisCacheProvider.md) — real backends
- `src/managers/CacheManager.ts` — consumer
