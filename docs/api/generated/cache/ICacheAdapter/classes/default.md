[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/ICacheAdapter](../README.md) / default

# Abstract Class: default

Defined in: src/cache/ICacheAdapter.ts:31

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

Defined in: src/cache/ICacheAdapter.ts:64

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

Defined in: src/cache/ICacheAdapter.ts:93

Close/cleanup the cache adapter

#### Returns

`Promise`\<`void`\>

***

### del()

> `abstract` __del__(`keys`): `Promise`\<`void`\>

Defined in: src/cache/ICacheAdapter.ts:56

Delete one or more keys from the cache

#### Parameters

##### keys

`string` \| `string`[]

Single key or array of keys to delete

#### Returns

`Promise`\<`void`\>

***

### get()

> `abstract` __get__\<`T`\>(`key`): `Promise`\<`T` \| `undefined`\>

Defined in: src/cache/ICacheAdapter.ts:38

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

Defined in: src/cache/ICacheAdapter.ts:86

Check if the cache adapter is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

***

### keys()

> `abstract` __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: src/cache/ICacheAdapter.ts:72

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

Defined in: src/cache/ICacheAdapter.ts:48

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

Defined in: src/cache/ICacheAdapter.ts:79

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../interfaces/CacheStats.md)\>

Cache statistics
