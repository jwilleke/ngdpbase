[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/TaggingService](../README.md) / TaggingOptions

# Interface: TaggingOptions

Defined in: src/utils/TaggingService.ts:21

## Properties

### allowedCategories?

> `optional` __allowedCategories?__: `string`[]

Defined in: src/utils/TaggingService.ts:33

Only auto-tag terms whose `category` is in this list. Terms with no
category set are also included. Default: ['subject']

***

### maxTags?

> `optional` __maxTags?__: `number`

Defined in: src/utils/TaggingService.ts:28

Maximum number of tags to return (highest-scoring first). Default: 10

***

### threshold?

> `optional` __threshold?__: `number`

Defined in: src/utils/TaggingService.ts:26

Minimum fraction of a vocabulary term's tokens that must appear in the
content text to count as a match. Default: 0.5 (half the tokens must hit).
