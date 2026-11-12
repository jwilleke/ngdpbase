[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / countStoreCopies

# Function: countStoreCopies()

> __countStoreCopies__(`pagesDirectory`, `kindId`, `layout?`): `Promise`\<`number`\>

Defined in: src/utils/privateStoreDoor.ts:120

How many users hold a copy of a kind: whose `store.json` for it exists.
The copy is what the door creates, so this is "who has walked through".

## Parameters

### pagesDirectory

`string`

### kindId

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`Promise`\<`number`\>
