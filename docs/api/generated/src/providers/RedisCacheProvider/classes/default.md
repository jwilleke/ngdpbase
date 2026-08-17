[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/RedisCacheProvider](../README.md) / default

# Class: default

Defined in: [src/providers/RedisCacheProvider.ts:33](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L33)

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

Defined in: [src/providers/RedisCacheProvider.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L38)

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

Defined in: [src/providers/BaseCacheProvider.ts:67](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseCacheProvider.ts#L67)

Reference to the wiki engine instance

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`engine`](../../BaseCacheProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/providers/BaseCacheProvider.ts:72](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseCacheProvider.ts#L72)

Whether the provider has been initialized

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`initialized`](../../BaseCacheProvider/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseCacheProvider/interfaces/BackupData.md)\>

Defined in: [src/providers/BaseCacheProvider.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseCacheProvider.ts#L166)

Backup cache configuration and state (optional)

#### Returns

`Promise`\<[`BackupData`](../../BaseCacheProvider/interfaces/BackupData.md)\>

Backup data

#### Inherited from

[`default`](../../BaseCacheProvider/classes/default.md).[`backup`](../../BaseCacheProvider/classes/default.md#backup)

***

### clear()

> __clear__(`_pattern?`): `Promise`\<`void`\>

Defined in: [src/providers/RedisCacheProvider.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L156)

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

Defined in: [src/providers/RedisCacheProvider.ts:194](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L194)

Close/cleanup the cache provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`close`](../../BaseCacheProvider/classes/default.md#close)

***

### del()

> __del__(`_keys`): `Promise`\<`void`\>

Defined in: [src/providers/RedisCacheProvider.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L143)

Delete one or more keys from the cache

#### Parameters

##### \_keys

Single key or array of keys to delete

`string` | `string`[]

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`del`](../../BaseCacheProvider/classes/default.md#del)

***

### get()

> __get__\<`T`\>(`_key`): `Promise`\<`T` \| `undefined`\>

Defined in: [src/providers/RedisCacheProvider.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L107)

Get a value from the cache

#### Type Parameters

##### T

`T` = `any`

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

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../BaseCacheProvider/interfaces/ProviderInfo.md)

Defined in: [src/providers/RedisCacheProvider.ts:91](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L91)

Get provider information

#### Returns

[`ProviderInfo`](../../BaseCacheProvider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`getProviderInfo`](../../BaseCacheProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/RedisCacheProvider.ts:48](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L48)

Initialize the Redis provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`initialize`](../../BaseCacheProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/providers/RedisCacheProvider.ts:184](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L184)

Check if the cache provider is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`isHealthy`](../../BaseCacheProvider/classes/default.md#ishealthy)

***

### keys()

> __keys__(`_pattern?`): `Promise`\<`string`[]\>

Defined in: [src/providers/RedisCacheProvider.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L166)

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

Defined in: [src/providers/BaseCacheProvider.ts:179](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseCacheProvider.ts#L179)

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

Defined in: [src/providers/RedisCacheProvider.ts:126](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L126)

Set a value in the cache

#### Type Parameters

##### T

`T` = `any`

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

Defined in: [src/providers/RedisCacheProvider.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/RedisCacheProvider.ts#L175)

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../../BaseCacheProvider/interfaces/CacheStats.md)\>

Cache statistics

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`stats`](../../BaseCacheProvider/classes/default.md#stats)
