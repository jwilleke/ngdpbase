[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreTakeout](../README.md) / collectStore

# Function: collectStore()

> __collectStore__(`pagesDirectory`, `owner`, `store`, `layout?`, `skip?`): `Promise`\<[`StoreTakeout`](../type-aliases/StoreTakeout.md)\>

Defined in: src/utils/privateStoreTakeout.ts:113

Every file of one store, as bytes.

Returns an empty file list when the store does not exist, so a caller can ask
about a store without first proving it is there.

## Parameters

### pagesDirectory

`string`

### owner

`string`

### store

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

### skip?

(`relativeToStore`) => `boolean`

## Returns

`Promise`\<[`StoreTakeout`](../type-aliases/StoreTakeout.md)\>
