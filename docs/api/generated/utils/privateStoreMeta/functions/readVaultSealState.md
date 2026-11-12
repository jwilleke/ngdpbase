[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMeta](../README.md) / readVaultSealState

# Function: readVaultSealState()

> __readVaultSealState__(`pagesDirectory`, `owner`, `store`, `layout`): `Promise`\<\{ `meta`: [`StoreKeyRecord`](../../privateStoreCrypto/type-aliases/StoreKeyRecord.md); `state`: [`VaultSealState`](../type-aliases/VaultSealState.md); \}\>

Defined in: src/utils/privateStoreMeta.ts:74

[VaultSealState](../type-aliases/VaultSealState.md) of `owner`'s `store`, with the record that decided it.

## Parameters

### pagesDirectory

`string`

### owner

`string`

### store

`string`

### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

## Returns

`Promise`\<\{ `meta`: [`StoreKeyRecord`](../../privateStoreCrypto/type-aliases/StoreKeyRecord.md); `state`: [`VaultSealState`](../type-aliases/VaultSealState.md); \}\>
