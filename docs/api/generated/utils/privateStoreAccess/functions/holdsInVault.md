[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreAccess](../README.md) / holdsInVault

# Function: holdsInVault()

> __holdsInVault__(`pdp`, `ctx`, `action`, `where`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreAccess.ts:124

Does `ctx` HOLD `action` inside `owner`'s vault (#2120)? [permitsInVault](permitsInVault.md)
without the step-up rule, for an affordance, and to tell a refusal for a
stale sign-in (answered with the step-up prompt) from a plain one. Shared
folders are not asked: `permitsInVault` decides them by permission alone.

## Parameters

### pdp

[`VaultHolder`](../interfaces/VaultHolder.md) \| `null` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### action

`string`

### where

#### owner

`string`

#### resource

`string`

#### vault

`string`

## Returns

`Promise`\<`boolean`\>
