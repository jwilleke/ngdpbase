[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/RegionCache](../README.md) / readThroughVersioned

# Function: readThroughVersioned()

> __readThroughVersioned__\<`T`\>(`store`, `versionOf`, `key`, `factory`, `options?`): `Promise`\<`T`\>

Defined in: src/cache/RegionCache.ts:59

Read-through with data versions (#1751), over any store with get and set.
Returns the stored value while every topic it was built from still has the
version it had then; otherwise computes it again with `factory`, stores it
with the versions it read (unless the render marked itself volatile), and
returns it. RegionCache.getOrSetVersioned is this over a region.

## Type Parameters

### T

`T`

## Parameters

### store

[`VersionedStore`](../interfaces/VersionedStore.md)

### versionOf

[`VersionLookup`](../../CacheDependencies/type-aliases/VersionLookup.md)

### key

`string`

### factory

(`deps`) => `Promise`\<`T`\>

### options?

[`VersionedSetOptions`](../interfaces/VersionedSetOptions.md) = `{}`

## Returns

`Promise`\<`T`\>
