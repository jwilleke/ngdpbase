[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / applyPagination

# Function: applyPagination()

> __applyPagination__\<`T`\>(`items`, `page`, `pageSize`): [`PaginationResult`](../interfaces/PaginationResult.md)\<`T`\>

Defined in: src/utils/pluginFormatters.ts:562

Slice `items` to the requested page.
When `pageSize` is 0 (disabled), returns all items as page 1 of 1.

## Type Parameters

### T

`T`

## Parameters

### items

`T`[]

### page

`number`

### pageSize

`number`

## Returns

[`PaginationResult`](../interfaces/PaginationResult.md)\<`T`\>
