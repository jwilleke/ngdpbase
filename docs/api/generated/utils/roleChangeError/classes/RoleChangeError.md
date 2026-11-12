[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/roleChangeError](../README.md) / RoleChangeError

# Class: RoleChangeError

Defined in: src/utils/roleChangeError.ts:15

A role change that did not happen (#2015).

Operator, 2026-10-23: adding or removing a role completes or it does not
happen, everywhere, and one that cannot be made is always an error. So a
request that asks for several role changes either gets all of them or none:
RoleManager undoes the ones that landed before the failure, then throws
this, and the request that asked fails with it.

The message is shown to whoever asked (an administrator's form). It names
the account, the change that failed and, when it is something an
administrator can fix, the reason (no Person record, no anchor
Organization). Storage detail (paths, errno) stays in `cause`, for the log.

## Extends

- `Error`

## Constructors

### Constructor

> __new RoleChangeError__(`subject`, `failed`, `options?`): `RoleChangeError`

Defined in: src/utils/roleChangeError.ts:21

#### Parameters

##### subject

`string`

##### failed

readonly `string`[]

##### options?

###### cause?

`unknown`

###### notUndone?

readonly `string`[]

###### reason?

`string`

#### Returns

`RoleChangeError`

#### Overrides

`Error.constructor`

## Properties

### failed

> `readonly` __failed__: readonly `string`[]

Defined in: src/utils/roleChangeError.ts:17

The change that could not be made, as `add <role>` / `remove <role>`.

***

### notUndone

> `readonly` __notUndone__: readonly `string`[]

Defined in: src/utils/roleChangeError.ts:19

Changes that landed, could not be undone, and so are still in effect. Empty when nothing was left changed.
