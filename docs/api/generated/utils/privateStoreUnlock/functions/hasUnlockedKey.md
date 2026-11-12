[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / hasUnlockedKey

# Function: hasUnlockedKey()

> __hasUnlockedKey__(`ctx`): `boolean`

Defined in: src/utils/privateStoreUnlock.ts:537

Whether this context's session holds an unlocked user key (#1448).

A yes/no, deliberately. [kekFor](kekFor.md) hands back a COPY of the key bytes,
which is right for a caller that is about to use them and wrong for one that
only needs to know they exist — every page render asks this, and none of
them should be copying key material into a buffer it then has to remember
to zero.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

## Returns

`boolean`
