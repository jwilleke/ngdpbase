[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FilePersonProvider](../README.md) / default

# Class: default

Defined in: src/providers/FilePersonProvider.ts:32

FilePersonProvider — JSON-file-per-person storage (#617)

One file per person under `ngdpbase.application.persons.storagedir`,
named `<uuid>.json` where the uuid matches the v4 segment of `@id`.

## Implements

- [`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `FilePersonProvider`

Defined in: src/providers/FilePersonProvider.ts:39

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FilePersonProvider`

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/FilePersonProvider.ts:33

***

### initialized

> __initialized__: `boolean` = `false`

Defined in: src/providers/FilePersonProvider.ts:34

## Methods

### create()

> __create__(`person`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

Defined in: src/providers/FilePersonProvider.ts:106

Persist a new Person. Returns the stored record.

#### Parameters

##### person

[`Person`](../../../types/Person/interfaces/Person.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`create`](../../../types/PersonProvider/interfaces/PersonProvider.md#create)

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/FilePersonProvider.ts:137

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`delete`](../../../types/PersonProvider/interfaces/PersonProvider.md#delete)

***

### getById()

> __getById__(`id`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/providers/FilePersonProvider.ts:89

Look up a person by `@id` (urn:uuid:<v4>).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`getById`](../../../types/PersonProvider/interfaces/PersonProvider.md#getbyid)

***

### getByIdentifier()

> __getByIdentifier__(`identifier`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/providers/FilePersonProvider.ts:100

Look up a person by `identifier` — typically the matching User.username.
Returns null if no Person carries that identifier.

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`getByIdentifier`](../../../types/PersonProvider/interfaces/PersonProvider.md#getbyidentifier)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/FilePersonProvider.ts:60

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`getProviderInfo`](../../../types/PersonProvider/interfaces/PersonProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FilePersonProvider.ts:43

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`initialize`](../../../types/PersonProvider/interfaces/PersonProvider.md#initialize)

***

### list()

> __list__(): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

Defined in: src/providers/FilePersonProvider.ts:69

Return all persons the provider can see.

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)[]\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`list`](../../../types/PersonProvider/interfaces/PersonProvider.md#list)

***

### replace()

> __replace__(`person`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

Defined in: src/providers/FilePersonProvider.ts:113

Write the whole record in place of the one with the same `@id` (#1930).
The only write that may change `identifier`: IdentityManager uses it to join
a person to an account.

#### Parameters

##### person

[`Person`](../../../types/Person/interfaces/Person.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md)\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`replace`](../../../types/PersonProvider/interfaces/PersonProvider.md#replace)

***

### update()

> __update__(`id`, `patch`): `Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

Defined in: src/providers/FilePersonProvider.ts:120

Apply a partial update by `@id`. Returns the updated record, or null if not found.

#### Parameters

##### id

`string`

##### patch

[`PersonUpdate`](../../../types/Person/type-aliases/PersonUpdate.md)

#### Returns

`Promise`\<[`Person`](../../../types/Person/interfaces/Person.md) \| `null`\>

#### Implementation of

[`PersonProvider`](../../../types/PersonProvider/interfaces/PersonProvider.md).[`update`](../../../types/PersonProvider/interfaces/PersonProvider.md#update)
