[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / isVaultPageUuid

# Function: isVaultPageUuid()

> __isVaultPageUuid__(`pagesDirectory`, `layout`, `vault`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/utils/pageNotes.ts:344

Whether `uuid` is a page of `owner`'s vault `store`, live or in its trash: known by its file name, no key needed.

## Parameters

### pagesDirectory

`string`

### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

### vault

#### owner

`string`

#### store

`string`

### uuid

`string`

## Returns

`Promise`\<`boolean`\>
