[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseCacheProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseCacheProvider.ts:55

BaseCacheProvider - Base class for all cache providers

Provides the interface that all cache providers must implement.
Follows the provider pattern established in AttachmentManager and PageManager.

Cache providers implement different storage backends (node-cache, Redis, etc.)

 BaseCacheProvider

## See

- NodeCacheProvider for in-memory implementation
- RedisCacheProvider for Redis implementation
- CacheManager for usage

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../NodeCacheProvider/classes/default.md)
- [`default`](../../NullCacheProvider/classes/default.md)
- [`default`](../../RedisCacheProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseCacheProvider`

Defined in: src/providers/BaseCacheProvider.ts:72

Creates a new cache provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`BaseCacheProvider`

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseCacheProvider.ts:59

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseCacheProvider.ts:64

Whether provider has been initialized

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerDescription`](../../BaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerFeatures`](../../BaseProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseProvider/classes/default.md).[`providerName`](../../BaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerVersion`](../../BaseProvider/classes/default.md#providerversion)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: src/providers/BaseCacheProvider.ts:159

Backup cache configuration and state (optional)

#### Returns

`Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Backup data

***

### clear()

> `abstract` __clear__(`pattern?`): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:128

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

Defined in: src/providers/BaseCacheProvider.ts:153

Close/cleanup the cache provider

#### Returns

`Promise`\<`void`\>

***

### del()

> `abstract` __del__(`keys`): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:121

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

Defined in: src/providers/BaseCacheProvider.ts:104

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

[`default`](../../BaseProvider/classes/default.md).[`getDurability`](../../BaseProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseCacheProvider.ts:89

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:83

Initialize the cache provider
Implementations should load configuration from ConfigurationManager

#### Returns

`Promise`\<`void`\>

***

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/BaseCacheProvider.ts:147

Check if the cache provider is healthy/connected

#### Returns

`Promise`\<`boolean`\>

True if healthy

***

### keys()

> `abstract` __keys__(`pattern?`): `Promise`\<`string`[]\>

Defined in: src/providers/BaseCacheProvider.ts:135

Get keys matching a pattern

#### Parameters

##### pattern?

`string`

Pattern to match (e.g., 'user:*' or '*' for all)

#### Returns

`Promise`\<`string`[]\>

Array of matching keys

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:172

Restore cache from backup (optional)

#### Parameters

##### \_backupData

[`BackupData`](../interfaces/BackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

***

### set()

> `abstract` __set__\<`T`\>(`key`, `value`, `ttlSec?`): `Promise`\<`void`\>

Defined in: src/providers/BaseCacheProvider.ts:114

Set a value in the cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

The cache key

##### value

`T`

The value to cache

##### ttlSec?

`number`

Time to live in seconds

#### Returns

`Promise`\<`void`\>

***

### stats()

> `abstract` __stats__(): `Promise`\<[`CacheStats`](../interfaces/CacheStats.md)\>

Defined in: src/providers/BaseCacheProvider.ts:141

Get cache statistics

#### Returns

`Promise`\<[`CacheStats`](../interfaces/CacheStats.md)\>

Cache statistics
