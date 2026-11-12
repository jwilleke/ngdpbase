[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / pageNotesRoots

# Function: pageNotesRoots()

> __pageNotesRoots__(`engine`, `kind`, `publicDir`): [`PageNotesRoots`](../interfaces/PageNotesRoots.md)

Defined in: src/utils/pageNotes.ts:76

The roots for `kind`: the manager's own folder, and the vaults where the
page provider keeps them (its `storagedir` and the configured layout), read
when asked rather than kept.

## Parameters

### engine

`EngineLike`

### kind

[`PageNotesKind`](../type-aliases/PageNotesKind.md)

### publicDir

`string`

## Returns

[`PageNotesRoots`](../interfaces/PageNotesRoots.md)
