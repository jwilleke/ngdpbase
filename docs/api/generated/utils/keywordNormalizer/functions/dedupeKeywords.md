[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / dedupeKeywords

# Function: dedupeKeywords()

> __dedupeKeywords__(`keywords`, `canonicalByValue?`): `string`[]

Defined in: src/utils/keywordNormalizer.ts:264

Collapse a keyword list to one entry per canonical value (#869 dedup
enforcement): case/space/accent variants of the same keyword are merged,
first occurrence wins ordering, empties dropped. When `canonicalByValue`
(value → registry title) is supplied, a kept keyword is snapped to the
registry's display title so `dining` converges on catalogued `Dining`;
otherwise the first-seen form is kept trimmed. Pure — the registry lookup
is passed in, not fetched here.

## Parameters

### keywords

readonly `string`[]

### canonicalByValue?

`ReadonlyMap`\<`string`, `string`\>

## Returns

`string`[]
