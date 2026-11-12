[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / groupKeywordVariants

# Function: groupKeywordVariants()

> __groupKeywordVariants__(`forms`): [`KeywordVariantGroup`](../interfaces/KeywordVariantGroup.md)[]

Defined in: src/utils/keywordNormalizer.ts:226

Group keyword display forms into variant clusters (#919, #869 Slice 4).
Forms are deduped by exact string (summing counts), grouped by
`normalizeKeywordValue` (folds case/space/accent/punctuation — stronger than
a lowercase match), and only values carried by __2+ distinct forms__ are
returned. Canonical form = the catalogued form if any, else the most-used.
`mergeable` is true when the canonical and at least one other form are both
catalog terms (the page-retag merge keys on catalog ids). Pure.

## Parameters

### forms

readonly [`KeywordFormStat`](../interfaces/KeywordFormStat.md)[]

## Returns

[`KeywordVariantGroup`](../interfaces/KeywordVariantGroup.md)[]
