[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / sweepOrphanedKeys

# Function: sweepOrphanedKeys()

> __sweepOrphanedKeys__(`liveHandles`): `number`

Defined in: src/utils/privateStoreUnlock.ts:568

Drop every unlocked bag whose handle no live session holds (#1626): a
session that expired in the store, or one destroyed by a path that could
not reach endSessionKeys, leaves its keys with no owner. Returns how many
bags were dropped.

## Parameters

### liveHandles

`ReadonlySet`\<`string`\>

## Returns

`number`
