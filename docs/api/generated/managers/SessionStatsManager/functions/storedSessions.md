[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SessionStatsManager](../README.md) / storedSessions

# Function: storedSessions()

> __storedSessions__(`store`): `Promise`\<[`StoredSession`](../interfaces/StoredSession.md)[]\>

Defined in: src/managers/SessionStatsManager.ts:152

Every session in the store with its id (#1937): `all()` keyed by id where
the store has it, else list and read each (the file store). A store whose
`all()` returns a bare array gives no ids, so it cannot be listed this way.

## Parameters

### store

[`SessionStoreLike`](../interfaces/SessionStoreLike.md)

## Returns

`Promise`\<[`StoredSession`](../interfaces/StoredSession.md)[]\>
