[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/OrganizationProvider](../README.md) / OrganizationProvider

# Interface: OrganizationProvider

Defined in: src/types/OrganizationProvider.ts:12

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

> __create__(`org`, `filename?`): `Promise`\<[`Organization`](../../Organization/interfaces/Organization.md)\>

Defined in: src/types/OrganizationProvider.ts:38

Create a new organization.

#### Parameters

##### org

[`Organization`](../../Organization/interfaces/Organization.md)

Full Organization record. The provider will write it under
              a filename derived from `filename` if supplied, or from a
              slug of `org.name` otherwise.

##### filename?

`string`

Optional explicit filename (used by install seeding).

#### Returns

`Promise`\<[`Organization`](../../Organization/interfaces/Organization.md)\>

The stored organization.

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/types/OrganizationProvider.ts:44

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getByFile()

> __getByFile__(`filename`): `Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/types/OrganizationProvider.ts:27

Look up an organization by its storage filename.

Used by OrganizationManager.getInstallOrg() to resolve the value of
`ngdpbase.application.organization.file` to the install's anchor org.
Providers that don't store records as discrete files should treat this
as an alias lookup or return null.

#### Parameters

##### filename

`string`

#### Returns

`Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>

***

### getById()

> __getById__(`id`): `Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/types/OrganizationProvider.ts:17

Look up an organization by its `@id` (canonical URL).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>

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

> __list__(): `Promise`\<[`Organization`](../../Organization/interfaces/Organization.md)[]\>

Defined in: src/types/OrganizationProvider.ts:14

Return all organizations the provider can see.

#### Returns

`Promise`\<[`Organization`](../../Organization/interfaces/Organization.md)[]\>

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

> __update__(`id`, `patch`): `Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>

Defined in: src/types/OrganizationProvider.ts:41

Apply a partial update by `@id`. Returns the updated record, or null if not found.

#### Parameters

##### id

`string`

##### patch

[`OrganizationUpdate`](../../Organization/type-aliases/OrganizationUpdate.md)

#### Returns

`Promise`\<[`Organization`](../../Organization/interfaces/Organization.md) \| `null`\>
