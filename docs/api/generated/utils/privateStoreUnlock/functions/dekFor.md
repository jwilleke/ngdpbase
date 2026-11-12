[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreUnlock](../README.md) / dekFor

# Function: dekFor()

> __dekFor__(`ctx`, `owner`, `store`): `Buffer`\<`ArrayBufferLike`\> \| `undefined`

Defined in: src/utils/privateStoreUnlock.ts:474

The DEK for `owner`'s `store` that this context holds, if any. Only from the
owner's own bag — DEKs are keyed by store id, and every user has a
`default` — or, for someone acting for the owner, from the key copy their
grant carries (#1762 slice 5).

A shared folder's key is the server's, never in a bag (#2125): handed only
to a context the PDP has permitted on that folder (`sharedFolderKeyFor`).

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

### owner

`string`

### store

`string`

## Returns

`Buffer`\<`ArrayBufferLike`\> \| `undefined`
