[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SessionStatsManager](../README.md) / listSessionUsers

# Function: listSessionUsers()

> __listSessionUsers__(`store`): `Promise`\<[`SessionUsers`](../interfaces/SessionUsers.md)\>

Defined in: src/managers/SessionStatsManager.ts:100

Authenticated usernames (sorted, distinct) and the anonymous session count.
Needs `all`; under `length` alone the list is empty and every session is
reported as anonymous.

## Parameters

### store

[`SessionStoreLike`](../interfaces/SessionStoreLike.md)

## Returns

`Promise`\<[`SessionUsers`](../interfaces/SessionUsers.md)\>
