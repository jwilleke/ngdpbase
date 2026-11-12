[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileRoleProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileRoleProvider.ts:24

FileRoleProvider — JSON-file-per-(org, role) storage (#617 follow-up).

One file per `namedPosition` under
`ngdpbase.application.roles.storagedir`, named `<namedPosition>.json`.
The (organization, namedPosition) pair is the natural key — uniqueness is
enforced on `create()`.

## Implements

- [`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileRoleProvider`

Defined in: src/providers/FileRoleProvider.ts:31

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`FileRoleProvider`

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/FileRoleProvider.ts:25

***

### initialized

> __initialized__: `boolean` = `false`

Defined in: src/providers/FileRoleProvider.ts:26

## Methods

### create()

> __create__(`role`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)\>

Defined in: src/providers/FileRoleProvider.ts:102

Persist a new role record. The provider derives the storage filename
from `role.namedPosition` (one file per (org, role) pair). Throws if a
record already exists for the same (organization, namedPosition) pair.

#### Parameters

##### role

[`Role`](../../../types/Role/interfaces/Role.md)

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`create`](../../../types/RoleProvider/interfaces/RoleProvider.md#create)

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/FileRoleProvider.ts:158

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`delete`](../../../types/RoleProvider/interfaces/RoleProvider.md#delete)

***

### getById()

> __getById__(`id`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/providers/FileRoleProvider.ts:81

Look up a role by `@id`.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`getById`](../../../types/RoleProvider/interfaces/RoleProvider.md#getbyid)

***

### getByOrgAndPosition()

> __getByOrgAndPosition__(`organizationId`, `namedPosition`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/providers/FileRoleProvider.ts:86

Look up the role record for a given (organization, namedPosition) pair.
Returns null if no record exists for that combination.

#### Parameters

##### organizationId

`string`

##### namedPosition

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`getByOrgAndPosition`](../../../types/RoleProvider/interfaces/RoleProvider.md#getbyorgandposition)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/FileRoleProvider.ts:52

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`getProviderInfo`](../../../types/RoleProvider/interfaces/RoleProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileRoleProvider.ts:35

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`initialize`](../../../types/RoleProvider/interfaces/RoleProvider.md#initialize)

***

### list()

> __list__(): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

Defined in: src/providers/FileRoleProvider.ts:61

Return all roles the provider can see.

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`list`](../../../types/RoleProvider/interfaces/RoleProvider.md#list)

***

### listByMember()

> __listByMember__(`personId`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

Defined in: src/providers/FileRoleProvider.ts:97

Return every role record whose `member` array contains `personId`.

#### Parameters

##### personId

`string`

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md)[]\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`listByMember`](../../../types/RoleProvider/interfaces/RoleProvider.md#listbymember)

***

### update()

> __update__(`id`, `patch`): `Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

Defined in: src/providers/FileRoleProvider.ts:130

Apply a partial update by `@id`. Returns the updated record, or null if not
found. A field the patch sets to `undefined` is REMOVED from the record —
how a stale field is cleared (#1431).

#### Parameters

##### id

`string`

##### patch

[`RoleUpdate`](../../../types/Role/type-aliases/RoleUpdate.md)

#### Returns

`Promise`\<[`Role`](../../../types/Role/interfaces/Role.md) \| `null`\>

#### Implementation of

[`RoleProvider`](../../../types/RoleProvider/interfaces/RoleProvider.md).[`update`](../../../types/RoleProvider/interfaces/RoleProvider.md#update)
