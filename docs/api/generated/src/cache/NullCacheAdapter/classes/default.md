[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/cache/NullCacheAdapter](../README.md) / default

# Class: default

Defined in: [src/cache/NullCacheAdapter.ts:7](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L7)

Null cache adapter - no-op implementation
Used when caching is disabled or for testing

## Extends

- [`default`](../../ICacheAdapter/classes/default.md)

## Constructors

### Constructor

> __new default__(): `NullCacheAdapter`

Defined in: [src/cache/NullCacheAdapter.ts:8](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L8)

#### Returns

`NullCacheAdapter`

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`constructor`](../../ICacheAdapter/classes/default.md#constructor)

## Methods

### clear()

> __clear__(): `Promise`\<`void`\>

Defined in: [src/cache/NullCacheAdapter.ts:24](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L24)

Clear cache entries

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`clear`](../../ICacheAdapter/classes/default.md#clear)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: [src/cache/NullCacheAdapter.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L47)

Close/cleanup the cache adapter

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`close`](../../ICacheAdapter/classes/default.md#close)

***

### del()

> __del__(): `Promise`\<`void`\>

Defined in: [src/cache/NullCacheAdapter.ts:20](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L20)

Delete one or more keys from the cache

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`del`](../../ICacheAdapter/classes/default.md#del)

***

### get()

> __get__\<`T`\>(): `Promise`\<`T` \| `undefined`\>

Defined in: [src/cache/NullCacheAdapter.ts:12](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L12)

Get a value from the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Returns

`Promise`\<`T` \| `undefined`\>

The cached value or undefined if not found

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`get`](../../ICacheAdapter/classes/default.md#get)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/cache/NullCacheAdapter.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L43)

Check if the cache adapter is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`isHealthy`](../../ICacheAdapter/classes/default.md#ishealthy)

***

### keys()

> __keys__(): `Promise`\<`string`[]\>

Defined in: [src/cache/NullCacheAdapter.ts:28](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L28)

Get keys matching a pattern

#### Returns

`Promise`\<`string`[]\>

Array of matching keys

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`keys`](../../ICacheAdapter/classes/default.md#keys)

***

### set()

> __set__(): `Promise`\<`void`\>

Defined in: [src/cache/NullCacheAdapter.ts:16](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L16)

Set a value in the cache

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`set`](../../ICacheAdapter/classes/default.md#set)

***

### stats()

> __stats__(): `Promise`\<[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md)\>

Defined in: [src/cache/NullCacheAdapter.ts:33](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/cache/NullCacheAdapter.ts#L33)

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../../ICacheAdapter/interfaces/CacheStats.md)\>

Cache statistics

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`stats`](../../ICacheAdapter/classes/default.md#stats)
