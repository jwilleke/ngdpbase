[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/suggestedKeywords](../README.md) / getSuggestedKeywordSets

# Function: getSuggestedKeywordSets()

> __getSuggestedKeywordSets__(`recent`, `currentKeywords?`, `opts?`): [`KeywordSetSuggestion`](../interfaces/KeywordSetSuggestion.md)[]

Defined in: src/utils/suggestedKeywords.ts:48

Rank an author's recent pages' keyword sets as suggestions for the page being
edited. `recent` need not be pre-sorted. `currentKeywords` (already on the
page) are subtracted from every suggestion.

## Parameters

### recent

[`RecentPageKeywords`](../interfaces/RecentPageKeywords.md)[]

### currentKeywords?

`string`[] = `[]`

### opts?

[`SuggestOptions`](../interfaces/SuggestOptions.md) = `{}`

## Returns

[`KeywordSetSuggestion`](../interfaces/KeywordSetSuggestion.md)[]
