[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AssetService](../README.md) / AssetSearchOptions

# Interface: AssetSearchOptions

Defined in: src/managers/AssetService.ts:26

Options for AssetService.search().

Extends the per-provider AssetQuery with service-level concerns:
store filtering (types) and access-control context (wikiContext).

## Properties

### dateField?

> `optional` __dateField?__: `"mtime"` \| `"exif_datetime"`

Defined in: src/managers/AssetService.ts:61

Date field to filter on

***

### dateFrom?

> `optional` __dateFrom?__: `string`

Defined in: src/managers/AssetService.ts:57

ISO 8601 start date for date range filtering

***

### dateTo?

> `optional` __dateTo?__: `string`

Defined in: src/managers/AssetService.ts:59

ISO 8601 end date for date range filtering

***

### extension?

> `optional` __extension?__: `string`

Defined in: src/managers/AssetService.ts:69

Filter by file extension

***

### includeHidden?

> `optional` __includeHidden?__: `boolean`

Defined in: src/managers/AssetService.ts:63

When true, include results from hidden/backup paths

***

### mime?

> `optional` __mime?__: `string`

Defined in: src/managers/AssetService.ts:67

Filter by exact MIME type

***

### mimeCategory?

> `optional` __mimeCategory?__: `"document"` \| `"image"` \| `"other"` \| `"video"` \| `"audio"`

Defined in: src/managers/AssetService.ts:49

Filter results to a MIME category: image / video / audio / document / other (#720)

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/managers/AssetService.ts:43

Zero-based offset into the full result set (default 0)

***

### order?

> `optional` __order?__: `"asc"` \| `"desc"`

Defined in: src/managers/AssetService.ts:47

Sort direction: 'asc' (default) or 'desc'

***

### pageSize?

> `optional` __pageSize?__: `number`

Defined in: src/managers/AssetService.ts:41

Number of results per page (default 48)

***

### pathPrefix?

> `optional` __pathPrefix?__: `string`

Defined in: src/managers/AssetService.ts:65

Restrict results to a specific path prefix

***

### query?

> `optional` __query?__: `string`

Defined in: src/managers/AssetService.ts:28

Free-text query — case-insensitive substring / keyword match

***

### sort?

> `optional` __sort?__: `"date"` \| `"caption"`

Defined in: src/managers/AssetService.ts:45

Sort field: 'date' (default) or 'caption'

***

### types?

> `optional` __types?__: `string`[]

Defined in: src/managers/AssetService.ts:37

Asset provider ids to search, e.g. `['local']`, `['sist2']`. A single id
narrows to that provider; omitted or more than one searches all registered
providers. Values are real provider ids since the picker dropdown became
registry-driven; the caller resolves the legacy `attachment` / `media`
aliases before this point.

***

### username?

> `optional` __username?__: `string`

Defined in: src/managers/AssetService.ts:55

Authenticated username — forwarded alongside roles for per-user path access rules

***

### userRoles?

> `optional` __userRoles?__: `string`[]

Defined in: src/managers/AssetService.ts:53

Authenticated user's roles — forwarded to providers for principal-based filtering

***

### wikiContext?

> `optional` __wikiContext?__: [`default`](../../../context/WikiContext/classes/default.md)

Defined in: src/managers/AssetService.ts:51

WikiContext for media access-control evaluation

***

### year?

> `optional` __year?__: `number`

Defined in: src/managers/AssetService.ts:39

Filter media results to a specific year
