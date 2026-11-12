[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / unlockedStoreIdsFor

# Function: unlockedStoreIdsFor()

> __unlockedStoreIdsFor__(`ctx`): `string`[]

Defined in: src/utils/privateStoreUnlock.ts:493

The ids of the requester's OWN stores whose DEK its session holds (#1400) —
the encrypted stores it can open right now. Another user's, or a locked
store, is never listed; acting for someone, the represented person's stores
the grant's key copy opened (#1762 slice 5). Ids only: no key bytes leave
the bag.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

## Returns

`string`[]
