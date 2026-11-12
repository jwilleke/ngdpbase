[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreAccess](../README.md) / mayEnterVaultAtDoor

# Function: mayEnterVaultAtDoor()

> __mayEnterVaultAtDoor__(`pdp`, `ctx`, `where`, `record?`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreAccess.ts:59

The container rule at a door (#2255): the owner or their delegate
([mayActInPrivateContainer](mayActInPrivateContainer.md)), or else an administrator let in by
`ngdpbase.vaults.admin-access` to a vault that is not encrypted, recorded
when `record`. Lists never ask this; they keep the owner's rule alone.

## Parameters

### pdp

`AdminVaultEntry` \| `null` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### where

#### owner

`string`

#### resource

`string`

#### vault

`string`

### record?

`boolean` = `true`

## Returns

`Promise`\<`boolean`\>
