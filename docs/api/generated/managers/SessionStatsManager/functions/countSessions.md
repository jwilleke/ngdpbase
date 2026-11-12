[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SessionStatsManager](../README.md) / countSessions

# Function: countSessions()

> __countSessions__(`store`): `Promise`\<[`SessionCount`](../interfaces/SessionCount.md)\>

Defined in: src/managers/SessionStatsManager.ts:81

Session count and distinct-user count. Prefers `length` (cheap), falls back
to `all`. Under `length` the distinct-user figure equals the session count,
which is what the route always reported on that path.

## Parameters

### store

[`SessionStoreLike`](../interfaces/SessionStoreLike.md)

## Returns

`Promise`\<[`SessionCount`](../interfaces/SessionCount.md)\>
