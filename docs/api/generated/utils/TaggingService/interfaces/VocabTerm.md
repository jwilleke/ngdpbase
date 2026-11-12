[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/TaggingService](../README.md) / VocabTerm

# Interface: VocabTerm

Defined in: src/utils/TaggingService.ts:15

TaggingService — statistical controlled-vocabulary tagger.

Scores page content against a fixed vocabulary (from CatalogManager) and
returns matched terms. No ML required — uses token overlap with a
configurable threshold.

Only terms in `allowedCategories` are candidates (default: ['subject']).
Workflow-status terms (draft, review, published) are intentionally excluded
so they remain manual workflow state — not content descriptors.

Related: #507 (auto-tagging for ElasticsearchSearchProvider)

## Properties

### category?

> `optional` __category?__: `string`

Defined in: src/utils/TaggingService.ts:18

***

### label

> __label__: `string`

Defined in: src/utils/TaggingService.ts:17

***

### term

> __term__: `string`

Defined in: src/utils/TaggingService.ts:16
