[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / pageNotesPlace

# Function: pageNotesPlace()

> __pageNotesPlace__(`ctx`, `page`, `roots`): `Promise`\<[`PageNotesPath`](../interfaces/PageNotesPath.md) & `object`\>

Defined in: src/utils/pageNotes.ts:117

Where `page`'s notes are and the I/O to use there, as `ctx` may. A vault
that refuses `ctx` (locked, or a sealed kind's vault not yet opened) throws,
for a read as for a write: a vault page's notes are never read or written
in the clear.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### page

[`PageRef`](../interfaces/PageRef.md)

### roots

[`PageNotesRoots`](../interfaces/PageNotesRoots.md)

## Returns

`Promise`\<[`PageNotesPath`](../interfaces/PageNotesPath.md) & `object`\>
