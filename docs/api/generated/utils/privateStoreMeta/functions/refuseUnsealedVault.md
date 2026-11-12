[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMeta](../README.md) / refuseUnsealedVault

# Function: refuseUnsealedVault()

> __refuseUnsealedVault__(`owner`, `store`, `state`): `void`

Defined in: src/utils/privateStoreMeta.ts:136

Throw [SealedVaultRefusedError](../classes/SealedVaultRefusedError.md) for a state that may not be read or
written, logging it: an unopened vault is the owner's next step (warn), a
mismatch is the site's configuration and its disk disagreeing (error).
Names the owner and vault, never a page or its content.

## Parameters

### owner

`string`

### store

`string`

### state

[`VaultSealState`](../type-aliases/VaultSealState.md)

## Returns

`void`
