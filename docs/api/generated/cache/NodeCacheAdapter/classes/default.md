[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [cache/NodeCacheAdapter](../README.md) / default

# Class: default

Defined in: src/cache/NodeCacheAdapter.ts:53

Node-cache based cache adapter
Provides in-memory caching with TTL support using the node-cache library

## Extends

- [`default`](../../ICacheAdapter/classes/default.md)

## Constructors

### Constructor

> __new default__(`options?`): `NodeCacheAdapter`

Defined in: src/cache/NodeCacheAdapter.ts:58

#### Parameters

##### options?

[`NodeCacheAdapterOptions`](../interfaces/NodeCacheAdapterOptions.md) = `{}`

#### Returns

`NodeCacheAdapter`

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`constructor`](../../ICacheAdapter/classes/default.md#constructor)

## Methods

### clear()

> __clear__(`pattern?`): `Promise`\<`void`\>

Defined in: src/cache/NodeCacheAdapter.ts:174

Clear cache entries

#### Parameters

##### pattern?

`string`

Optional pattern to match keys (e.g., 'user:*')

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`clear`](../../ICacheAdapter/classes/default.md#clear)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: src/cache/NodeCacheAdapter.ts:308

Close/cleanup the cache adapter

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`close`](../../ICacheAdapter/classes/default.md#close)

***

### del()

> __del__(`keys`): `Promise`\<`void`\>

Defined in: src/cache/NodeCacheAdapter.ts:150

Delete one or more keys from the cache

#### Parameters

##### keys

`string` \| `string`[]

Single key or array of keys to delete

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`del`](../../ICacheAdapter/classes/default.md#del)

***

### get()

> __get__\<`T`\>(`key`): `Promise`\<`T` \| `undefined`\>

Defined in: src/cache/NodeCacheAdapter.ts:97

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

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`get`](../../ICacheAdapter/classes/default.md#get)

***

### getNodeCache()

> __getNodeCache__(): `NodeCache` \| `null`

Defined in: src/cache/NodeCacheAdapter.ts:326

Get the underlying node-cache instance (for advanced usage)

#### Returns

`NodeCache` \| `null`

The node-cache instance

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/cache/NodeCacheAdapter.ts:289

Check if the cache adapter is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`isHealthy`](../../ICacheAdapter/classes/default.md#ishealthy)

***

### keys()

> __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: src/cache/NodeCacheAdapter.ts:202

Get keys matching a pattern

#### Parameters

##### pattern?

`string` = `'*'`

Pattern to match (e.g., 'user:*' or '*' for all)

#### Returns

`Promise`\<`string`[]\>

Array of matching keys

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`keys`](../../ICacheAdapter/classes/default.md#keys)

***

### set()

> __set__(`key`, `value`, `ttlSec?`): `Promise`\<`void`\>

Defined in: src/cache/NodeCacheAdapter.ts:126

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

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`set`](../../ICacheAdapter/classes/default.md#set)

***

### stats()

> __stats__(): `Promise`\<[`ExtendedCacheStats`](../interfaces/ExtendedCacheStats.md)\>

Defined in: src/cache/NodeCacheAdapter.ts:233

Get cache statistics

#### Returns

`Promise`\<[`ExtendedCacheStats`](../interfaces/ExtendedCacheStats.md)\>

Cache statistics

#### Overrides

[`default`](../../ICacheAdapter/classes/default.md).[`stats`](../../ICacheAdapter/classes/default.md#stats)
