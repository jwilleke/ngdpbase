[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / storeDeletedIndexPath

# Function: storeDeletedIndexPath()

> __storeDeletedIndexPath__(`pagesDirectory`, `creator`, `store?`, `layout?`): `string`

Defined in: src/utils/privateStorePath.ts:581

A store's own trash record: `{privateroot}/{user}/{store}/{storedeleted}` (#1459).

Beside the store's other indexes, so it is sealed exactly when the store is
and travels with it — a deleted private page leaves no trace outside its own
store, not in the global trash and not in `page-index.json`.

## Parameters

### pagesDirectory

`string`

### creator

`string`

### store?

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`string`
