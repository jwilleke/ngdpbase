[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/PersonProvider](../README.md) / PersonProvider

# Interface: PersonProvider

Defined in: src/types/PersonProvider.ts:11

Base provider interface

All providers must implement this interface.

## Extends

- [`BaseProvider`](../../Provider/interfaces/BaseProvider.md)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](../../Provider/interfaces/BaseProvider.md).[`backup`](../../Provider/interfaces/BaseProvider.md#backup)

***

### create()

> __create__(`person`): `Promise`\<[`Person`](../../Person/interfaces/Person.md)\>

Defined in: src/types/PersonProvider.ts:25

Persist a new Person. Returns the stored record.

#### Parameters

##### person

[`Person`](../../Person/interfaces/Person.md)

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md)\>

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/types/PersonProvider.ts:38

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getById()

> __getById__(`id`): `Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>

Defined in: src/types/PersonProvider.ts:16

Look up a person by `@id` (urn:uuid:<v4>).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>

***

### getByIdentifier()

> __getByIdentifier__(`identifier`): `Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>

Defined in: src/types/PersonProvider.ts:22

Look up a person by `identifier` — typically the matching User.username.
Returns null if no Person carries that identifier.

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](../../Provider/interfaces/ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](../../Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](../../Provider/interfaces/BaseProvider.md).[`getProviderInfo`](../../Provider/interfaces/BaseProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](../../Provider/interfaces/BaseProvider.md).[`initialize`](../../Provider/interfaces/BaseProvider.md#initialize)

***

### list()

> __list__(): `Promise`\<[`Person`](../../Person/interfaces/Person.md)[]\>

Defined in: src/types/PersonProvider.ts:13

Return all persons the provider can see.

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md)[]\>

***

### replace()

> __replace__(`person`): `Promise`\<[`Person`](../../Person/interfaces/Person.md)\>

Defined in: src/types/PersonProvider.ts:32

Write the whole record in place of the one with the same `@id` (#1930).
The only write that may change `identifier`: IdentityManager uses it to join
a person to an account.

#### Parameters

##### person

[`Person`](../../Person/interfaces/Person.md)

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md)\>

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

[`BaseProvider`](../../Provider/interfaces/BaseProvider.md).[`restore`](../../Provider/interfaces/BaseProvider.md#restore)

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](../../Provider/interfaces/BaseProvider.md).[`shutdown`](../../Provider/interfaces/BaseProvider.md#shutdown)

***

### update()

> __update__(`id`, `patch`): `Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>

Defined in: src/types/PersonProvider.ts:35

Apply a partial update by `@id`. Returns the updated record, or null if not found.

#### Parameters

##### id

`string`

##### patch

[`PersonUpdate`](../../Person/type-aliases/PersonUpdate.md)

#### Returns

`Promise`\<[`Person`](../../Person/interfaces/Person.md) \| `null`\>
