[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / movePageNotes

# Function: movePageNotes()

> __movePageNotes__(`ctx`, `uuid`, `fromName`, `toName`, `roots`): `Promise`\<`boolean`\>

Defined in: src/utils/pageNotes.ts:194

Move a page's notes when the page changes place — into a vault, out of one,
or between two — through both sides' I/O, as its history moves: sealed going
into a sealed vault, opened coming out, never copied in the clear into a
sealed one. A rename within one place moves nothing (the files are keyed by
uuid). Both I/Os are resolved before anything moves.

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### uuid

`string`

### fromName

`string`

### toName

`string`

### roots

[`PageNotesRoots`](../interfaces/PageNotesRoots.md)

## Returns

`Promise`\<`boolean`\>

true when something was moved
