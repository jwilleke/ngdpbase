[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetQuery

# Interface: AssetQuery

Defined in: src/types/Asset.ts:263

Query parameters for AssetProvider.search().

## Properties

### dateField?

> `optional` __dateField?__: `"mtime"` \| `"exif_datetime"`

Defined in: src/types/Asset.ts:294

Date field to filter on: 'mtime' (file-modified, default) or 'exif_datetime' (EXIF capture date) (#518)

***

### dateFrom?

> `optional` __dateFrom?__: `string`

Defined in: src/types/Asset.ts:290

ISO 8601 start date for date range filtering (#518)

***

### dateTo?

> `optional` __dateTo?__: `string`

Defined in: src/types/Asset.ts:292

ISO 8601 end date for date range filtering (#518)

***

### extension?

> `optional` __extension?__: `string`

Defined in: src/types/Asset.ts:302

Filter by file extension, e.g. from a facet click (#520)

***

### includeHidden?

> `optional` __includeHidden?__: `boolean`

Defined in: src/types/Asset.ts:296

When true, include results from hidden/backup paths (default: false) (#519)

***

### mime?

> `optional` __mime?__: `string`

Defined in: src/types/Asset.ts:300

Filter by exact MIME type, e.g. from a facet click (#520)

***

### mimeCategory?

> `optional` __mimeCategory?__: `"document"` \| `"image"` \| `"other"` \| `"video"` \| `"audio"`

Defined in: src/types/Asset.ts:269

Filter results to a MIME category (#720)

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/types/Asset.ts:273

Zero-based offset into the full result set (default 0)

***

### order?

> `optional` __order?__: `"asc"` \| `"desc"`

Defined in: src/types/Asset.ts:277

Sort direction

***

### pageSize?

> `optional` __pageSize?__: `number`

Defined in: src/types/Asset.ts:271

Number of results per page (default 48)

***

### pathPrefix?

> `optional` __pathPrefix?__: `string`

Defined in: src/types/Asset.ts:298

Restrict results to a specific path prefix, e.g. "jims/photos" (#519)

***

### query?

> `optional` __query?__: `string`

Defined in: src/types/Asset.ts:265

Free-text query — case-insensitive substring / keyword match

***

### sort?

> `optional` __sort?__: `"date"` \| `"caption"`

Defined in: src/types/Asset.ts:275

Sort field

***

### username?

> `optional` __username?__: `string`

Defined in: src/types/Asset.ts:288

Authenticated username — passed alongside userRoles so providers can apply
per-user path access rules (consistent with the audience/access principal model).

***

### userRoles?

> `optional` __userRoles?__: `string`[]

Defined in: src/types/Asset.ts:283

Authenticated user's roles — passed from the request context so providers
can apply principal-based filtering (e.g. sist2 path access control).
Providers that don't use roles simply ignore this field.

***

### year?

> `optional` __year?__: `number`

Defined in: src/types/Asset.ts:267

Filter media results to a specific year
