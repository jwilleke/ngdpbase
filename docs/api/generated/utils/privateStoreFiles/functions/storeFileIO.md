[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / storeFileIO

# Function: storeFileIO()

> __storeFileIO__(`ctx`, `args`): `Promise`\<[`StoreFileIO`](../interfaces/StoreFileIO.md)\>

Defined in: src/utils/privateStoreFiles.ts:80

The I/O for `owner`'s `store`, as this context may use it. Plain for a store
that is not encrypted; sealed with the store DEK when it is. An encrypted
store whose DEK this context does not hold is refused — a read as much as a
write, so a locked store never falls back to reading or writing in the clear.

Whether the store is encrypted is asked of both its kind and its copy
(#1834): `layout` is the configured one, whose `sealedVaults` are the kinds
that are sealed. A vault of a sealed kind with no `store.json` (its door not
yet opened) or a `store.json` that is not sealed is refused, read and write
alike, with `SealedVaultRefusedError` — never handed plain I/O.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

### args

#### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

#### owner

`string`

#### pagesDirectory

`string`

#### store

`string`

## Returns

`Promise`\<[`StoreFileIO`](../interfaces/StoreFileIO.md)\>
