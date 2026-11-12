[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageNotes](../README.md) / pageNotesOn

# Function: pageNotesOn()

> __pageNotesOn__(`kind`, `pageMetadata`, `categoryEntry`): `boolean`

Defined in: src/utils/pageNotes.ts:134

Whether `kind` is on for a page (#1951, docs/system-category.md): THE rule,
said once. The page's own frontmatter (`comments:` / `footnotes:`) wins;
without it, its system-category entry's field of the same name decides;
unset is on. Only a boolean counts, and only `false` turns it off.

Pure. [pageNotesAllowed](pageNotesAllowed.md) gathers the page's metadata and entry for it.

## Parameters

### kind

[`PageNotesKind`](../type-aliases/PageNotesKind.md)

### pageMetadata

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

### categoryEntry

`Record`\<`string`, `unknown`\> \| `null` \| `undefined`

## Returns

`boolean`
