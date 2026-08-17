[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/NullCacheProvider](../README.md) / default

# Class: default

Defined in: [src/providers/NullCacheProvider.ts:10](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L10)

NullCacheProvider - No-op cache provider

Used when caching is disabled or for testing.
All cache operations are no-ops that return immediately.

## Extends

- [`default`](../../BaseCacheProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `NullCacheProvider`

Defined in: [src/providers/NullCacheProvider.ts:11](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L11)

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`NullCacheProvider`

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

Defined in: [src/providers/NullCacheProvider.ts:75](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L75)

Clear cache entries (no-op)

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

Defined in: [src/providers/NullCacheProvider.ts:118](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L118)

Close/cleanup the cache provider (no-op)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`close`](../../BaseCacheProvider/classes/default.md#close)

***

### del()

> __del__(`_keys`): `Promise`\<`void`\>

Defined in: [src/providers/NullCacheProvider.ts:65](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L65)

Delete one or more keys from the cache (no-op)

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

Defined in: [src/providers/NullCacheProvider.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L43)

Get a value from the cache (always returns undefined)

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### \_key

`string`

The cache key

#### Returns

`Promise`\<`T` \| `undefined`\>

Always undefined

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`get`](../../BaseCacheProvider/classes/default.md#get)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../BaseCacheProvider/interfaces/ProviderInfo.md)

Defined in: [src/providers/NullCacheProvider.ts:28](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L28)

Get provider information

#### Returns

[`ProviderInfo`](../../BaseCacheProvider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`getProviderInfo`](../../BaseCacheProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/NullCacheProvider.ts:19](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L19)

Initialize the null cache provider (no-op)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`initialize`](../../BaseCacheProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/providers/NullCacheProvider.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L110)

Check if the cache provider is healthy (always true)

#### Returns

`Promise`\<`boolean`\>

Always true

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`isHealthy`](../../BaseCacheProvider/classes/default.md#ishealthy)

***

### keys()

> __keys__(`_pattern?`): `Promise`\<`string`[]\>

Defined in: [src/providers/NullCacheProvider.ts:85](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L85)

Get keys matching a pattern (always returns empty array)

#### Parameters

##### \_pattern?

`string` = `'*'`

Pattern to match

#### Returns

`Promise`\<`string`[]\>

Empty array

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

Defined in: [src/providers/NullCacheProvider.ts:55](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L55)

Set a value in the cache (no-op)

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

Defined in: [src/providers/NullCacheProvider.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/NullCacheProvider.ts#L93)

Get cache statistics (all zeros)

#### Returns

`Promise`\<[`CacheStats`](../../BaseCacheProvider/interfaces/CacheStats.md)\>

Cache statistics with all zeros

#### Overrides

[`default`](../../BaseCacheProvider/classes/default.md).[`stats`](../../BaseCacheProvider/classes/default.md#stats)
