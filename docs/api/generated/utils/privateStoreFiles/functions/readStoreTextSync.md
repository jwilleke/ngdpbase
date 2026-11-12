[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / readStoreTextSync

# Function: readStoreTextSync()

> __readStoreTextSync__(`ctx`, `args`): `string` \| `null`

Defined in: src/utils/privateStoreFiles.ts:108

Read one text file of `owner`'s `store` synchronously, as this context may:
plain for a store that is not encrypted, opened with the store DEK when it
is. Null when the file does not exist, or the store is encrypted and this
context does not hold its DEK — a locked store reads as nothing, never in
the clear (#1456: a store's page index is small, and page lookups are
synchronous).

A vault of a sealed kind that is not itself sealed (#1834) reads as nothing
too, with a warning: its files, if any, were written in the clear and are
not served as if they were sealed.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

### args

#### file

`string`

#### layout

[`PrivateStoreLayout`](../../privateStorePath/type-aliases/PrivateStoreLayout.md)

#### owner

`string`

#### pagesDirectory

`string`

#### store

`string`

## Returns

`string` \| `null`
