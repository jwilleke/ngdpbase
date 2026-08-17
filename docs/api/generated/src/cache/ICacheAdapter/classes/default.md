[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/cache/ICacheAdapter](../README.md) / default

# Abstract Class: default

Defined in: [src/cache/ICacheAdapter.ts:31](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L31)

Cache adapter interface
All cache adapters must implement these methods

## Extended by

- [`default`](../../NodeCacheAdapter/classes/default.md)
- [`default`](../../NullCacheAdapter/classes/default.md)

## Constructors

### Constructor

> __new default__(): `ICacheAdapter`

#### Returns

`ICacheAdapter`

## Methods

### clear()

> `abstract` __clear__(`pattern?`): `Promise`\<`void`\>

Defined in: [src/cache/ICacheAdapter.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L64)

Clear cache entries

#### Parameters

##### pattern?

`string`

Optional pattern to match keys (e.g., 'user:*')

#### Returns

`Promise`\<`void`\>

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: [src/cache/ICacheAdapter.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L93)

Close/cleanup the cache adapter

#### Returns

`Promise`\<`void`\>

***

### del()

> `abstract` __del__(`keys`): `Promise`\<`void`\>

Defined in: [src/cache/ICacheAdapter.ts:56](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L56)

Delete one or more keys from the cache

#### Parameters

##### keys

Single key or array of keys to delete

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

***

### get()

> `abstract` __get__\<`T`\>(`key`): `Promise`\<`T` \| `undefined`\>

Defined in: [src/cache/ICacheAdapter.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L38)

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

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/cache/ICacheAdapter.ts:86](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L86)

Check if the cache adapter is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

***

### keys()

> `abstract` __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: [src/cache/ICacheAdapter.ts:72](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L72)

Get keys matching a pattern

#### Parameters

##### pattern?

`string`

Pattern to match (e.g., 'user:*' or '*' for all)

#### Returns

`Promise`\<`string`[]\>

Array of matching keys

***

### set()

> `abstract` __set__(`key`, `value`, `ttlSec?`): `Promise`\<`void`\>

Defined in: [src/cache/ICacheAdapter.ts:48](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L48)

Set a value in the cache

#### Parameters

##### key

`string`

The cache key

##### value

`unknown`

The value to cache

##### ttlSec?

`number`

Time to live in seconds

#### Returns

`Promise`\<`void`\>

***

### stats()

> `abstract` __stats__(): `Promise`\<[`CacheStats`](../interfaces/CacheStats.md)\>

Defined in: [src/cache/ICacheAdapter.ts:79](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/ICacheAdapter.ts#L79)

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../interfaces/CacheStats.md)\>

Cache statistics
