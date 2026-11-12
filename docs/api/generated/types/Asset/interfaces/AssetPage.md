[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetPage

# Interface: AssetPage

Defined in: src/types/Asset.ts:333

Paginated result returned by AssetProvider.search().

## Properties

### aggregations?

> `optional` __aggregations?__: [`AssetAggregations`](AssetAggregations.md)

Defined in: src/types/Asset.ts:341

Faceted aggregation data (populated by providers that support it)

***

### hasMore

> __hasMore__: `boolean`

Defined in: src/types/Asset.ts:339

True when there are more results beyond this page

***

### results

> __results__: [`AssetRecord`](AssetRecord.md)[]

Defined in: src/types/Asset.ts:335

Current page of results

***

### total

> __total__: `number`

Defined in: src/types/Asset.ts:337

Total number of matching items
