[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/suggestedKeywords](../README.md) / SuggestOptions

# Interface: SuggestOptions

Defined in: src/utils/suggestedKeywords.ts:27

## Properties

### halfLifeDays?

> `optional` __halfLifeDays?__: `number`

Defined in: src/utils/suggestedKeywords.ts:33

Recency half-life in days — a page this old counts half. Default 14.

***

### maxSets?

> `optional` __maxSets?__: `number`

Defined in: src/utils/suggestedKeywords.ts:29

Max suggestions returned. Default 5.

***

### now?

> `optional` __now?__: `number`

Defined in: src/utils/suggestedKeywords.ts:31

"Now" epoch ms for recency decay. Default Date.now().
