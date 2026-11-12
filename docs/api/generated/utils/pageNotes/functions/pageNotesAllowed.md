[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / pageNotesAllowed

# Function: pageNotesAllowed()

> __pageNotesAllowed__(`engine`, `kind`, `page`, `ctx`, `metadata?`): `Promise`\<`boolean`\>

Defined in: src/utils/pageNotes.ts:160

[pageNotesOn](pageNotesOn.md) for `page`, as `ctx` reads it (#1951): its metadata
(`metadata` when the caller already holds it, else the stored page's) and
its system-category entry, the default system-category's when the page
names none. A page not stored yet has no metadata, so its system-category
decides. The managers' `isAllowedOn` doors are this; nothing else calls it.

## Parameters

### engine

`EngineLike`

### kind

[`PageNotesKind`](../type-aliases/PageNotesKind.md)

### page

[`PageRef`](../interfaces/PageRef.md)

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### metadata?

`Record`\<`string`, `unknown`\> \| `null`

## Returns

`Promise`\<`boolean`\>
