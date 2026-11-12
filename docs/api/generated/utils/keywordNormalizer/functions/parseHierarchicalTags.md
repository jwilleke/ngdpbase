[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / parseHierarchicalTags

# Function: parseHierarchicalTags()

> __parseHierarchicalTags__(`hierarchicalSubject`, `tagsList`): `string`[]

Defined in: src/utils/keywordNormalizer.ts:82

Parse hierarchical tag values (#917) into `/`-joined canonical-value paths.
digiKam/Lightroom store the tag tree two ways; both are unioned + deduped:

- `XMP-lr:HierarchicalSubject` — `|`-separated (`Places|USA|Colorado|Denver`)
- `XMP-digiKam:TagsList`       — `/`-separated (`Places/USA/Colorado/Denver`)
Each segment is run through `normalizeKeywordValue`, so a path becomes
`places/usa/colorado/denver` (leaf = last segment). Empty segments are
dropped; a value that is a scalar string is treated as a single-entry list.

## Parameters

### hierarchicalSubject

`unknown`

### tagsList

`unknown`

## Returns

`string`[]
