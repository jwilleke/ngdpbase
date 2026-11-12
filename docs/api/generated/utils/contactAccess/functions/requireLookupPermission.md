[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / requireLookupPermission

# Function: requireLookupPermission()

> __requireLookupPermission__(`engine`, `ctx`, `permission`): `Promise`\<`void`\>

Defined in: src/utils/contactAccess.ts:111

A lookup of users (#2018): `UserManager.searchUsers` asks `permission`
(`search-user`) with the caller's context, and throws
[ContactRefusedError](../classes/ContactRefusedError.md) on a refusal. Core's own work
([isSystemWork](isSystemWork.md)) is allowed without a policy evaluation.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### permission

[`CorePermission`](../../../security/permissions.generated/type-aliases/CorePermission.md)

## Returns

`Promise`\<`void`\>
