[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/RoleProvider](../README.md) / RoleProvider

# Interface: RoleProvider

Defined in: src/types/RoleProvider.ts:11

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

> __create__(`role`): `Promise`\<[`Role`](../../Role/interfaces/Role.md)\>

Defined in: src/types/RoleProvider.ts:32

Persist a new role record. The provider derives the storage filename
from `role.namedPosition` (one file per (org, role) pair). Throws if a
record already exists for the same (organization, namedPosition) pair.

#### Parameters

##### role

[`Role`](../../Role/interfaces/Role.md)

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md)\>

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/types/RoleProvider.ts:42

Delete by `@id`. Returns true if a record was removed.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getById()

> __getById__(`id`): `Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>

Defined in: src/types/RoleProvider.ts:16

Look up a role by `@id`.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>

***

### getByOrgAndPosition()

> __getByOrgAndPosition__(`organizationId`, `namedPosition`): `Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>

Defined in: src/types/RoleProvider.ts:22

Look up the role record for a given (organization, namedPosition) pair.
Returns null if no record exists for that combination.

#### Parameters

##### organizationId

`string`

##### namedPosition

`string`

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>

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

> __list__(): `Promise`\<[`Role`](../../Role/interfaces/Role.md)[]\>

Defined in: src/types/RoleProvider.ts:13

Return all roles the provider can see.

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md)[]\>

***

### listByMember()

> __listByMember__(`personId`): `Promise`\<[`Role`](../../Role/interfaces/Role.md)[]\>

Defined in: src/types/RoleProvider.ts:25

Return every role record whose `member` array contains `personId`.

#### Parameters

##### personId

`string`

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md)[]\>

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

> __update__(`id`, `patch`): `Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>

Defined in: src/types/RoleProvider.ts:39

Apply a partial update by `@id`. Returns the updated record, or null if not
found. A field the patch sets to `undefined` is REMOVED from the record —
how a stale field is cleared (#1431).

#### Parameters

##### id

`string`

##### patch

[`RoleUpdate`](../../Role/type-aliases/RoleUpdate.md)

#### Returns

`Promise`\<[`Role`](../../Role/interfaces/Role.md) \| `null`\>
