[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / requireContactPermission

# Function: requireContactPermission()

> __requireContactPermission__(`engine`, `ctx`, `kind`, `also?`): `Promise`\<`void`\>

Defined in: src/utils/contactAccess.ts:55

Throws [ContactRefusedError](../classes/ContactRefusedError.md) unless `ctx` may do `kind` (`read` asks
`identity-read`, `manage` asks `identity-manage`), and each of `also` (a link
to an account also asks `user-edit`). A missing context or decision point
refuses: closed, never open.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### kind

`"manage"` \| `"read"`

### also?

readonly [`CorePermission`](../../../security/permissions.generated/type-aliases/CorePermission.md)[] = `[]`

## Returns

`Promise`\<`void`\>
