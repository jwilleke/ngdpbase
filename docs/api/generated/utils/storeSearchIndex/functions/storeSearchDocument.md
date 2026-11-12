[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/storeSearchIndex](../README.md) / storeSearchDocument

# Function: storeSearchDocument()

> __storeSearchDocument__(`args`): [`StoreSearchDocument`](../interfaces/StoreSearchDocument.md)

Defined in: src/utils/storeSearchIndex.ts:80

The document for one page of a store, from what a save already has in hand.

The same frontmatter fields the shared index reads (`tags`,
`user-keywords`, `system-category`), so a private page and a public one are
found by the same words.

## Parameters

### args

#### content

`string`

#### metadata?

`Record`\<`string`, `unknown`\>

#### title

`string`

#### uuid

`string`

## Returns

[`StoreSearchDocument`](../interfaces/StoreSearchDocument.md)
