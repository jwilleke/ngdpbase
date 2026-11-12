[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/RegionCache](../README.md) / VersionedSetOptions

# Interface: VersionedSetOptions

Defined in: src/cache/RegionCache.ts:31

Options for getOrSetVersioned.

## Extends

- [`CacheSetOptions`](CacheSetOptions.md)

## Properties

### onResult?

> `optional` __onResult?__: (`hit`) => `void`

Defined in: src/cache/RegionCache.ts:33

Told whether the value came from the cache (true) or was computed (false); for hit/miss metrics.

#### Parameters

##### hit

`boolean`

#### Returns

`void`

***

### ttl?

> `optional` __ttl?__: `number`

Defined in: src/cache/RegionCache.ts:10

Time to live in seconds

#### Inherited from

[`CacheSetOptions`](CacheSetOptions.md).[`ttl`](CacheSetOptions.md#ttl)
