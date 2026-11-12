[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileOrganizationProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileOrganizationProvider.ts:24

FileOrganizationProvider — JSON-file-per-org storage (#617)

One file per organization under `ngdpbase.application.organization.storagedir`.
Filename is the install-supplied filename (for the anchor org) or a slug of
the org's `name`. Writes are atomic (temp file + rename).

## Implements

- [`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileOrganizationProvider`

Defined in: src/providers/FileOrganizationProvider.ts:31

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FileOrganizationProvider`

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/FileOrganizationProvider.ts:25

***

### initialized

> __initialized__: `boolean` = `false`

Defined in: src/providers/FileOrganizationProvider.ts:26

## Methods

### create()

> __create__(`org`, `filename?`): `Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md)\>

Defined in: src/providers/FileOrganizationProvider.ts:92

Create a new organization.

#### Parameters

##### org

[`Organization`](../../../types/Organization/interfaces/Organization.md)

Full Organization record. The provider will write it under
              a filename derived from `filename` if supplied, or from a
              slug of `org.name` otherwise.

##### filename?

`string`

Optional explicit filename (used by install seeding).

#### Returns

`Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md)\>

The stored organization.

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`create`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#create)

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/FileOrganizationProvider.ts:147

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`delete`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#delete)

***

### getByFile()

> __getByFile__(`filename`): `Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/providers/FileOrganizationProvider.ts:86

Look up an organization by its storage filename.

Used by OrganizationManager.getInstallOrg() to resolve the value of
`ngdpbase.application.organization.file` to the install's anchor org.
Providers that don't store records as discrete files should treat this
as an alias lookup or return null.

#### Parameters

##### filename

`string`

#### Returns

`Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`getByFile`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#getbyfile)

***

### getById()

> __getById__(`id`): `Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/providers/FileOrganizationProvider.ts:81

Look up an organization by its `@id` (canonical URL).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`getById`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#getbyid)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/FileOrganizationProvider.ts:52

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`getProviderInfo`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileOrganizationProvider.ts:35

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`initialize`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#initialize)

***

### list()

> __list__(): `Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md)[]\>

Defined in: src/providers/FileOrganizationProvider.ts:61

Return all organizations the provider can see.

#### Returns

`Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md)[]\>

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`list`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#list)

***

### update()

> __update__(`id`, `patch`): `Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/providers/FileOrganizationProvider.ts:121

Apply a partial update by `@id`. Returns the updated record, or null if not found.

#### Parameters

##### id

`string`

##### patch

[`OrganizationUpdate`](../../../types/Organization/type-aliases/OrganizationUpdate.md)

#### Returns

`Promise`\<[`Organization`](../../../types/Organization/interfaces/Organization.md) \| `null`\>

#### Implementation of

[`OrganizationProvider`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md).[`update`](../../../types/OrganizationProvider/interfaces/OrganizationProvider.md#update)
