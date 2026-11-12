[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / CacheProvider

# Interface: CacheProvider

Defined in: src/types/Provider.ts:875

Cache provider interface

Defines the contract for caching backends (in-memory, Redis, etc.).

## Extends

- [`BaseProvider`](BaseProvider.md)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### clear()

> __clear__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:903

Clear all cached values

#### Returns

`Promise`\<`void`\>

Promise that resolves when cache is cleared

***

### delete()

> __delete__(`key`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:897

Delete value from cache

#### Parameters

##### key

`string`

Cache key

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### get()

> __get__\<`T`\>(`key`): `Promise`\<`T` \| `null`\>

Defined in: src/types/Provider.ts:881

Get value from cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

Cache key

#### Returns

`Promise`\<`T` \| `null`\>

Cached value or null if not found/expired

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### has()

> __has__(`key`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:910

Check if key exists in cache

#### Parameters

##### key

`string`

Cache key

#### Returns

`Promise`\<`boolean`\>

True if key exists and not expired

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### restore()?

> `optional` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:82

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`restore`](BaseProvider.md#restore)

***

### set()

> __set__\<`T`\>(`key`, `value`, `ttl?`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:890

Set value in cache

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### key

`string`

Cache key

##### value

`T`

Value to cache

##### ttl?

`number`

Time to live in seconds (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when value is cached

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
