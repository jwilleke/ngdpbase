[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / buildLeafPathMap

# Function: buildLeafPathMap()

> __buildLeafPathMap__(`paths`): `Map`\<`string`, `string`\>

Defined in: src/utils/keywordNormalizer.ts:172

Build a leaf→path map from many hierarchical paths (#917) — the library-wide
"where does this leaf keyword live" lookup #918 uses to place a newly-added
keyword at its known hierarchical home. Leaf = last path segment; on conflict
the most frequently-seen path wins (ties broken by longest, then first).

## Parameters

### paths

`Iterable`\<`string`\>

## Returns

`Map`\<`string`, `string`\>
