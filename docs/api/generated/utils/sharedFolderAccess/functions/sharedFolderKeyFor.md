[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFolderAccess](../README.md) / sharedFolderKeyFor

# Function: sharedFolderKeyFor()

> __sharedFolderKeyFor__(`ctx`, `folder`): `Buffer`\<`ArrayBufferLike`\> \| `undefined`

Defined in: src/utils/sharedFolderAccess.ts:111

Folder `folder`'s key for `ctx`, for the store I/O (`dekFor`): only when
the PDP permitted this context on the folder. A copy; the caller may zero it.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

### folder

`string`

## Returns

`Buffer`\<`ArrayBufferLike`\> \| `undefined`
