[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / CatalogQuery

# Interface: CatalogQuery

Defined in: src/types/Schema.ts:390

Query passed to CatalogSource.list() and CatalogManager.listCreativeWorks().

`filters` is intentionally untyped — it carries source-specific knobs
(e.g. MediaManager-only EXIF filters). Sources ignore keys they don't
understand.

## Properties

### cursor?

> `optional` __cursor?__: `string`

Defined in: src/types/Schema.ts:407

Opaque cursor returned by a prior list() call.

***

### dateRange?

> `optional` __dateRange?__: `object`

Defined in: src/types/Schema.ts:398

Inclusive ISO 8601 date range against dateCreated.

#### from?

> `optional` __from?__: `string`

#### to?

> `optional` __to?__: `string`

***

### filters?

> `optional` __filters?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/Schema.ts:410

Source-specific filters bag (Decision 7). Sources ignore unknown keys.

***

### keywords?

> `optional` __keywords?__: `string`[]

Defined in: src/types/Schema.ts:401

Keyword filter — terms must appear in `keywords`.

***

### limit?

> `optional` __limit?__: `number`

Defined in: src/types/Schema.ts:404

Page size. Sources may cap this.

***

### text?

> `optional` __text?__: `string`

Defined in: src/types/Schema.ts:395

Free-text query — delegated to the source's own search backend.

***

### types?

> `optional` __types?__: [`SchemaType`](../type-aliases/SchemaType.md)[]

Defined in: src/types/Schema.ts:392

Restrict to specific subtypes.
