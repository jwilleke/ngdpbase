[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / storeFileIOForPath

# Function: storeFileIOForPath()

> __storeFileIOForPath__(`ctx`, `args`): `Promise`\<[`StoreFileIO`](../interfaces/StoreFileIO.md)\>

Defined in: src/utils/privateStoreFiles.ts:159

The I/O for whichever store holds `file`; plain for a file in no store.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

### args

#### file

`string`

#### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

#### pagesDirectory

`string`

## Returns

`Promise`\<[`StoreFileIO`](../interfaces/StoreFileIO.md)\>
