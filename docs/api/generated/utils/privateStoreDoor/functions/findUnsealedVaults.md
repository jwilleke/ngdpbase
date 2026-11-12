[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / findUnsealedVaults

# Function: findUnsealedVaults()

> __findUnsealedVaults__(`pagesDirectory`, `layout`): `Promise`\<[`UnsealedVault`](../interfaces/UnsealedVault.md)[]\>

Defined in: src/utils/privateStoreDoor.ts:148

Every vault of a sealed kind that holds files in the clear (#1834): a folder
with something in it but no `store.json` (written before its door was
opened), or a `store.json` that is not sealed. Read only — nothing is moved,
sealed or deleted; what to do with the files is an administrator's call.

## Parameters

### pagesDirectory

`string`

### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

## Returns

`Promise`\<[`UnsealedVault`](../interfaces/UnsealedVault.md)[]\>
