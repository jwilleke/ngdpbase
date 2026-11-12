[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/storeSearchIndex](../README.md) / matchStoreSearch

# Function: matchStoreSearch()

> __matchStoreSearch__(`documents`, `ask?`): [`StoreSearchMatch`](../interfaces/StoreSearchMatch.md)[]

Defined in: src/utils/storeSearchIndex.ts:162

The documents of one store that match, best first.

Every term must match somewhere (AND), as the field-scoped shared search
does. A title match scores far above a body match, so the page a reader
named comes first.

## Parameters

### documents

`Record`\<`string`, [`StoreSearchDocument`](../interfaces/StoreSearchDocument.md)\>

### ask?

[`StoreSearchQuery`](../interfaces/StoreSearchQuery.md) = `{}`

## Returns

[`StoreSearchMatch`](../interfaces/StoreSearchMatch.md)[]
