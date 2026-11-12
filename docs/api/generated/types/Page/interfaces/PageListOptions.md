[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / PageListOptions

# Interface: PageListOptions

Defined in: src/types/Page.ts:248

Page list options

Options for filtering and sorting page lists.

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Page.ts:253

Filter by author

***

### category?

> `optional` __category?__: `string`

Defined in: src/types/Page.ts:250

Filter by category

***

### includeRequired?

> `optional` __includeRequired?__: `boolean`

Defined in: src/types/Page.ts:271

Include required-pages in results

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/types/Page.ts:256

Filter by keywords (AND logic)

***

### limit?

> `optional` __limit?__: `number`

Defined in: src/types/Page.ts:265

Pagination: number of results per page

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/types/Page.ts:268

Pagination: page offset (0-based)

***

### sortBy?

> `optional` __sortBy?__: `"author"` \| `"category"` \| `"title"` \| `"lastModified"`

Defined in: src/types/Page.ts:259

Sort field

***

### sortOrder?

> `optional` __sortOrder?__: `"asc"` \| `"desc"`

Defined in: src/types/Page.ts:262

Sort order
