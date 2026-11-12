[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreExport](../README.md) / buildStoreTakeout

# Function: buildStoreTakeout()

> __buildStoreTakeout__(`ctx`, `options`): `Promise`\<[`Takeout`](../type-aliases/Takeout.md)\>

Defined in: src/utils/privateStoreExport.ts:169

Build a takeout of one store.

Throws when the store is encrypted and `ctx` does not hold its key — the
caller turns that into "unlock your store first", never into an empty
archive.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### options

[`TakeoutOptions`](../type-aliases/TakeoutOptions.md)

## Returns

`Promise`\<[`Takeout`](../type-aliases/Takeout.md)\>
