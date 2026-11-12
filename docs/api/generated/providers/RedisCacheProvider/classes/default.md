[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/RedisCacheProvider](../README.md) / default

# Class: default

Defined in: src/providers/RedisCacheProvider.ts:34

RedisCacheProvider - Redis-based cache provider (FUTURE IMPLEMENTATION)

Provides distributed caching using Redis.
Suitable for multi-instance deployments and production environments.

Configuration keys (all lowercase):

- ngdpbase.cache.provider.redis.url - Redis connection URL
- ngdpbase.cache.provider.redis.keyprefix - Key prefix for all cache keys
- ngdpbase.cache.provider.redis.enablecluster - Enable Redis Cluster support
- ngdpbase.cache.provider.redis.connecttimeout - Connection timeout in ms

TODO: Implement Redis integration using 'redis' or 'ioredis' npm package
TODO: Add connection pooling support
TODO: Add cluster mode support
TODO: Add pub/sub for cache invalidation across instances

## Extends

- [`default`](../../BaseCacheProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `RedisCacheProvider`

Defined in: src/providers/RedisCacheProvider.ts:38

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`RedisCacheProvider`

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`constructor`](../../BaseCacheProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseCacheProvider.ts:59

Reference to the wiki engine instance

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`engine`](../../BaseCacheProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseCacheProvider.ts:64

Whether the provider has been initialized

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`initialized`](../../BaseCacheProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`providerDescription`](../../BaseCacheProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`providerFeatures`](../../BaseCacheProvider/classes/default.md#providerfeatures)

***

### providerName?

> `protected` `optional` __providerName?__: `string`

Defined in: src/providers/BaseProvider.ts:73

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`providerName`](../../BaseCacheProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`providerVersion`](../../BaseCacheProvider/classes/default.md#providerversion)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseCacheProvider/interfaces/BackupData.md)\>

Defined in: src/providers/BaseCacheProvider.ts:159

Backup cache configuration and state (optional)

#### Returns

`Promise`\<[`BackupData`](../../BaseCacheProvider/interfaces/BackupData.md)\>

Backup data

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`backup`](../../BaseCacheProvider/classes/default.md#backup)

***

### clear()

> __clear__(`_pattern?`): `Promise`\<`void`\>

Defined in: src/providers/RedisCacheProvider.ts:154

Clear cache entries

#### Parameters

##### \_pattern?

`string`

Optional pattern to match keys

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`clear`](../../BaseCacheProvider/classes/default.md#clear)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: src/providers/RedisCacheProvider.ts:192

Close/cleanup the cache provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`close`](../../BaseCacheProvider/classes/default.md#close)

***

### del()

> __del__(`_keys`): `Promise`\<`void`\>

Defined in: src/providers/RedisCacheProvider.ts:141

Delete one or more keys from the cache

#### Parameters

##### \_keys

`string` \| `string`[]

Single key or array of keys to delete

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`del`](../../BaseCacheProvider/classes/default.md#del)

***

### get()

> __get__\<`T`\>(`_key`): `Promise`\<`T` \| `undefined`\>

Defined in: src/providers/RedisCacheProvider.ts:106

Get a value from the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### \_key

`string`

The cache key

#### Returns

`Promise`\<`T` \| `undefined`\>

The cached value or undefined if not found

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`get`](../../BaseCacheProvider/classes/default.md#get)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`getDurability`](../../BaseCacheProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/RedisCacheProvider.ts:91

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`getProviderInfo`](../../BaseCacheProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/RedisCacheProvider.ts:48

Initialize the Redis provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`initialize`](../../BaseCacheProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/RedisCacheProvider.ts:182

Check if the cache provider is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`isHealthy`](../../BaseCacheProvider/classes/default.md#ishealthy)

***

### keys()

> __keys__(`_pattern?`): `Promise`\<`string`[]\>

Defined in: src/providers/RedisCacheProvider.ts:164

Get keys matching a pattern

#### Parameters

##### \_pattern?

`string` = `'*'`

Pattern to match

#### Returns

`Promise`\<`string`[]\>

Array of matching keys

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`keys`](../../BaseCacheProvider/classes/default.md#keys)

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:172

Restore cache from backup (optional)

#### Parameters

##### \_backupData

[`BackupData`](../../BaseCacheProvider/interfaces/BackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`restore`](../../BaseCacheProvider/classes/default.md#restore)

***

### set()

> __set__\<`T`\>(`_key`, `_value`, `_ttlSec?`): `Promise`\<`void`\>

Defined in: src/providers/RedisCacheProvider.ts:124

Set a value in the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### \_key

`string`

The cache key

##### \_value

`T`

The value to cache

##### \_ttlSec?

`number`

Time to live in seconds

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`set`](../../BaseCacheProvider/classes/default.md#set)

***

### stats()

> __stats__(): `Promise`\<[`CacheStats`](../../BaseCacheProvider/interfaces/CacheStats.md)\>

Defined in: src/providers/RedisCacheProvider.ts:173

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../../BaseCacheProvider/interfaces/CacheStats.md)\>

Cache statistics

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`stats`](../../BaseCacheProvider/classes/default.md#stats)
