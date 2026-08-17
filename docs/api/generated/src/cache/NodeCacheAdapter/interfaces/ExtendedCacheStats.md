[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/cache/NodeCacheAdapter](../README.md) / ExtendedCacheStats

# Interface: ExtendedCacheStats

Defined in: [src/cache/NodeCacheAdapter.ts:36](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L36)

Extended cache statistics with additional metrics

## Extends

- [`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md)

## Properties

### deletes

> __deletes__: `number`

Defined in: [src/cache/NodeCacheAdapter.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L40)

Number of delete operations

***

### hitRate

> __hitRate__: `number`

Defined in: [src/cache/NodeCacheAdapter.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L42)

Hit rate percentage

***

### hits

> __hits__: `number`

Defined in: [src/cache/ICacheAdapter.ts:14](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L14)

Number of cache hits

#### Inherited from

[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md).[`hits`](../../ICacheAdapter/interfaces/CacheStats.md#hits)

***

### keys

> __keys__: `number`

Defined in: [src/cache/ICacheAdapter.ts:18](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L18)

Number of keys in cache

#### Inherited from

[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md).[`keys`](../../ICacheAdapter/interfaces/CacheStats.md#keys)

***

### ksize

> __ksize__: `number`

Defined in: [src/cache/ICacheAdapter.ts:20](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L20)

Approximate memory usage of keys in bytes

#### Inherited from

[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md).[`ksize`](../../ICacheAdapter/interfaces/CacheStats.md#ksize)

***

### maxKeys

> __maxKeys__: `number`

Defined in: [src/cache/NodeCacheAdapter.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L44)

Maximum number of keys allowed

***

### misses

> __misses__: `number`

Defined in: [src/cache/ICacheAdapter.ts:16](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L16)

Number of cache misses

#### Inherited from

[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md).[`misses`](../../ICacheAdapter/interfaces/CacheStats.md#misses)

***

### sets

> __sets__: `number`

Defined in: [src/cache/NodeCacheAdapter.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L38)

Number of set operations

***

### stdTTL

> __stdTTL__: `number`

Defined in: [src/cache/NodeCacheAdapter.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NodeCacheAdapter.ts#L46)

Standard TTL in seconds

***

### vsize

> __vsize__: `number`

Defined in: [src/cache/ICacheAdapter.ts:22](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L22)

Approximate memory usage of values in bytes

#### Inherited from

[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md).[`vsize`](../../ICacheAdapter/interfaces/CacheStats.md#vsize)
