[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/CacheDependencies](../README.md) / VersionLookup

# Type Alias: VersionLookup

> __VersionLookup__ = (`topic`) => `Promise`\<`string`\>

Defined in: src/cache/CacheDependencies.ts:14

What a cached render read (#1751).

A render declares each data topic it depends on — by convention the name of
the manager that owns the data, such as `LedgerManager` — before it reads.
The topic's version is snapshotted at that moment, so a write that lands
while the render is still running leaves the entry already stale rather
than wrongly current. The manager bumps its topic after a write
(`CacheManager.bump`), and `RegionCache.getOrSetVersioned` re-renders.

A render whose output changes with nothing written (a clock) marks itself
volatile: it is returned but never stored.

## Parameters

### topic

`string`

## Returns

`Promise`\<`string`\>
