[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SessionStatsManager](../README.md) / liveSessionHandles

# Function: liveSessionHandles()

> __liveSessionHandles__(`store`): `Promise`\<`Set`\<`string`\>\>

Defined in: src/managers/SessionStatsManager.ts:173

The private-store handles held by sessions still in the store (#1626).
Uses `all()` where the store has it, else lists and reads each session:
the file store has no `all()`, so the sweep failed on every run there and
no orphaned key was ever dropped.

## Parameters

### store

[`SessionStoreLike`](../interfaces/SessionStoreLike.md)

## Returns

`Promise`\<`Set`\<`string`\>\>
