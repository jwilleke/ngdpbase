[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / valueLevels

# Function: valueLevels()

> __valueLevels__(`read`): `Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>

Defined in: src/utils/sensitiveValues.ts:74

The declared levels: the legacy list's keys as `secret`, then the new map
(`"secret"`, `"sensitive"`, `true` = secret; `false` / `null` removes an
entry, so an instance can override a shipped one). An entry that is not a
well-formed key or path (#1889: an empty segment, a `*` inside a segment, or
a `*` before `ngdpbase.<category>`) is no entry, as a level that is none of
these is no entry; [sensitiveValueProblems](sensitiveValueProblems.md) names both.

## Parameters

### read

`Read`

## Returns

`Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>
