[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Page](../README.md) / PageListOptions

# Interface: PageListOptions

Defined in: [src/types/Page.ts:167](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L167)

Page list options

Options for filtering and sorting page lists.

## Properties

### author?

> `optional` __author__: `string`

Defined in: [src/types/Page.ts:172](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L172)

Filter by author

***

### category?

> `optional` __category__: `string`

Defined in: [src/types/Page.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L169)

Filter by category

***

### includeRequired?

> `optional` __includeRequired__: `boolean`

Defined in: [src/types/Page.ts:190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L190)

Include required-pages in results

***

### keywords?

> `optional` __keywords__: `string`[]

Defined in: [src/types/Page.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L175)

Filter by keywords (AND logic)

***

### limit?

> `optional` __limit__: `number`

Defined in: [src/types/Page.ts:184](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L184)

Pagination: number of results per page

***

### offset?

> `optional` __offset__: `number`

Defined in: [src/types/Page.ts:187](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L187)

Pagination: page offset (0-based)

***

### sortBy?

> `optional` __sortBy__: `"title"` \| `"lastModified"` \| `"category"` \| `"author"`

Defined in: [src/types/Page.ts:178](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L178)

Sort field

***

### sortOrder?

> `optional` __sortOrder__: `"asc"` \| `"desc"`

Defined in: [src/types/Page.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L181)

Sort order
