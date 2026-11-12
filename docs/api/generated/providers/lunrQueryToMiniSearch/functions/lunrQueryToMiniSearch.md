[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/lunrQueryToMiniSearch](../README.md) / lunrQueryToMiniSearch

# Function: lunrQueryToMiniSearch()

> __lunrQueryToMiniSearch__(`query`, `fields`): `Query` \| `null`

Defined in: src/providers/lunrQueryToMiniSearch.ts:81

The MiniSearch query for a Lunr-style string, or null when the string holds
nothing to search for.

## Parameters

### query

`string`

the query as a caller or a person wrote it

### fields

readonly `string`[]

the indexed field names; a `field:` prefix naming another is plain text

## Returns

`Query` \| `null`
