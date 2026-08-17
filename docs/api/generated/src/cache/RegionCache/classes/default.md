[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/cache/RegionCache](../README.md) / default

# Class: default

Defined in: [src/cache/RegionCache.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L35)

RegionCache - Cache wrapper that provides namespaced access to a cache adapter

This class wraps a cache adapter and automatically prefixes all keys with a region name,
providing isolation between different cache users (managers, components, etc.)

## Constructors

### Constructor

> __new default__(`adapter`, `region`): `RegionCache`

Defined in: [src/cache/RegionCache.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L40)

#### Parameters

##### adapter

[`default`](../../ICacheAdapter/classes/default.md)

##### region

`string`

#### Returns

`RegionCache`

## Methods

### clear()

> __clear__(`pattern?`): `Promise`\<`void`\>

Defined in: [src/cache/RegionCache.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L113)

Clear all cache entries for this region

#### Parameters

##### pattern?

`string`

Optional pattern to match keys within the region

#### Returns

`Promise`\<`void`\>

***

### del()

> __del__(`keys`): `Promise`\<`void`\>

Defined in: [src/cache/RegionCache.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L98)

Delete one or more keys from the cache

#### Parameters

##### keys

Single key or array of keys to delete

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

***

### get()

> __get__\<`T`\>(`key`): `Promise`\<`T` \| `undefined`\>

Defined in: [src/cache/RegionCache.ts:75](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L75)

Get a value from the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

The cache key

#### Returns

`Promise`\<`T` \| `undefined`\>

The cached value or undefined if not found

***

### getAdapter()

> __getAdapter__(): [`default`](../../ICacheAdapter/classes/default.md)

Defined in: [src/cache/RegionCache.ts:229](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L229)

Get the underlying adapter

#### Returns

[`default`](../../ICacheAdapter/classes/default.md)

The cache adapter

***

### getOrSet()

> __getOrSet__\<`T`\>(`key`, `factory`, `options?`): `Promise`\<`T`\>

Defined in: [src/cache/RegionCache.ts:173](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L173)

Get or set a value (cache-aside pattern)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

The cache key

##### factory

[`CacheFactory`](../type-aliases/CacheFactory.md)\<`T`\>

Function to generate the value if not cached

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`T`\>

The cached or generated value

***

### getRegion()

> __getRegion__(): `string`

Defined in: [src/cache/RegionCache.ts:220](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L220)

Get the region name

#### Returns

`string`

The region name

***

### has()

> __has__(`key`): `Promise`\<`boolean`\>

Defined in: [src/cache/RegionCache.ts:160](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L160)

Check if a key exists in this region

#### Parameters

##### key

`string`

The cache key

#### Returns

`Promise`\<`boolean`\>

True if key exists

***

### keys()

> __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: [src/cache/RegionCache.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L131)

Get keys matching a pattern within this region

#### Parameters

##### pattern?

`string` = `'*'`

Pattern to match

#### Returns

`Promise`\<`string`[]\>

Array of matching keys (without region prefix)

***

### mget()

> __mget__\<`T`\>(`keys`): `Promise`\<`Record`\<`string`, `T` \| `undefined`\>\>

Defined in: [src/cache/RegionCache.ts:192](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L192)

Get multiple keys at once

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### keys

`string`[]

Array of cache keys

#### Returns

`Promise`\<`Record`\<`string`, `T` \| `undefined`\>\>

Object with keys as properties and cached values

***

### mset()

> __mset__(`keyValuePairs`, `options?`): `Promise`\<`void`\>

Defined in: [src/cache/RegionCache.ts:209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L209)

Set multiple keys at once

#### Parameters

##### keyValuePairs

`Record`\<`string`, `unknown`\>

Object with keys and values to set

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`void`\>

***

### set()

> __set__(`key`, `value`, `options?`): `Promise`\<`void`\>

Defined in: [src/cache/RegionCache.ts:87](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L87)

Set a value in the cache

#### Parameters

##### key

`string`

The cache key

##### value

`unknown`

The value to cache

##### options?

[`CacheSetOptions`](../interfaces/CacheSetOptions.md) = `{}`

Cache options

#### Returns

`Promise`\<`void`\>

***

### stats()

> __stats__(): `Promise`\<[`RegionStats`](../interfaces/RegionStats.md)\>

Defined in: [src/cache/RegionCache.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/RegionCache.ts#L142)

Get cache statistics for this region

#### Returns

`Promise`\<[`RegionStats`](../interfaces/RegionStats.md)\>

Cache statistics for this region
