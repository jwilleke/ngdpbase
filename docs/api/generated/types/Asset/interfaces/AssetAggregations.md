[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetAggregations

# Interface: AssetAggregations

Defined in: src/types/Asset.ts:319

Faceted aggregation data returned alongside AssetPage results.
Only populated by providers that support server-side aggregations (e.g. Sist2AssetProvider).

## Properties

### byExtension?

> `optional` __byExtension?__: [`AssetFacet`](AssetFacet.md)[]

Defined in: src/types/Asset.ts:327

Distribution by file extension

***

### byFolder?

> `optional` __byFolder?__: [`AssetFacet`](AssetFacet.md)[]

Defined in: src/types/Asset.ts:325

Distribution by top-level folder

***

### byMime?

> `optional` __byMime?__: [`AssetFacet`](AssetFacet.md)[]

Defined in: src/types/Asset.ts:321

Distribution by MIME type

***

### byYear?

> `optional` __byYear?__: [`AssetFacet`](AssetFacet.md)[]

Defined in: src/types/Asset.ts:323

Distribution by year (from mtime)
