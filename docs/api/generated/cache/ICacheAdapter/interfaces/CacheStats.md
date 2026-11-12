[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/ICacheAdapter](../README.md) / CacheStats

# Interface: CacheStats

Defined in: src/cache/ICacheAdapter.ts:12

Cache statistics structure

## Extended by

- [`ExtendedCacheStats`](../../NodeCacheAdapter/interfaces/ExtendedCacheStats.md)

## Properties

### hits

> __hits__: `number`

Defined in: src/cache/ICacheAdapter.ts:14

Number of cache hits

***

### keys

> __keys__: `number`

Defined in: src/cache/ICacheAdapter.ts:18

Number of keys in cache

***

### ksize

> __ksize__: `number`

Defined in: src/cache/ICacheAdapter.ts:20

Approximate memory usage of keys in bytes

***

### misses

> __misses__: `number`

Defined in: src/cache/ICacheAdapter.ts:16

Number of cache misses

***

### vsize

> __vsize__: `number`

Defined in: src/cache/ICacheAdapter.ts:22

Approximate memory usage of values in bytes
