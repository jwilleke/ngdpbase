[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / vaultMustBeSealed

# Function: vaultMustBeSealed()

> __vaultMustBeSealed__(`pagesDirectory`, `owner`, `store`, `layout`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreFiles.ts:196

Whether `owner`'s `store` holds, or must hold, only sealed bytes (#1836):
its kind is sealed, or its `store.json` is. A `store.json` that cannot be
read counts as sealed — the answer that never lets plaintext in.

For the paths that put bytes into a vault without its store I/O (a backup
restore, a legacy migration, a tombstone put back): they hold no DEK, so
where this is true they write only bytes that are already sealed, or refuse.

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

`Promise`\<`boolean`\>
