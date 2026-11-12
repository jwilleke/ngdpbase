[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / isSystemWork

# Function: isSystemWork()

> __isSystemWork__(`engine`, `ctx`): `boolean`

Defined in: src/utils/contactAccess.ts:74

Core's own work (#2018): a boot or schedule context naming the system
principal, with no token, share or proxy claim. Recognised by its fields
alone, with no policy evaluation, because RoleManager resolves roles
through these lookups on every request. A request never carries this
context: the system principal's name is reserved, so no account holds it.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `null` \| `undefined`

## Returns

`boolean`
