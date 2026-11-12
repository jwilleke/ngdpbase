[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildKeywordPool](../README.md) / buildKeywordPool

# Function: buildKeywordPool()

> __buildKeywordPool__(`catalog`, `observed`): `string`[]

Defined in: src/utils/buildKeywordPool.ts:45

Merge the vocabulary catalog with keywords observed in the page index into
one sorted, deduplicated suggestion list.

Dedupe is case-insensitive and first-seen casing wins, so `journal` from
migrated entries and `Journal` from seed pages do not both appear. Catalog
order is therefore meaningful: it is consulted first, so the curated casing
beats whatever happens to be in the index.

## Parameters

### catalog

[`KeywordCatalogEntry`](../type-aliases/KeywordCatalogEntry.md)[] \| `null` \| `undefined`

vocabulary catalog — strings or `{label, id}`

### observed

(`string` \| `null` \| `undefined`)[] \| `null` \| `undefined`

keyword labels seen on real pages

## Returns

`string`[]
