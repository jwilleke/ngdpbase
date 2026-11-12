[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / PageInfo

# Interface: PageInfo

Defined in: src/types/Page.ts:158

Minimal page information for listings

Used in page indexes, search results, and navigation where full content
is not needed. This is stored in page-index.json.

## Extended by

- [`PageSearchResult`](PageSearchResult.md)

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Page.ts:181

Page author (from metadata)

***

### category?

> `optional` __category?__: `string`

Defined in: src/types/Page.ts:187

Category (from metadata)

***

### created?

> `optional` __created?__: `string`

Defined in: src/types/Page.ts:178

Creation timestamp (from metadata, #754)

***

### editor?

> `optional` __editor?__: `string`

Defined in: src/types/Page.ts:184

Last editor (from metadata)

***

### filePath

> __filePath__: `string`

Defined in: src/types/Page.ts:166

Absolute file path to the page file

***

### lastModified?

> `optional` __lastModified?__: `string`

Defined in: src/types/Page.ts:175

Last modification timestamp (from metadata)

***

### location?

> `optional` __location?__: `"pages"` \| `"required-pages"`

Defined in: src/types/Page.ts:172

Location type

***

### metadata

> __metadata__: [`PageFrontmatter`](PageFrontmatter.md)

Defined in: src/types/Page.ts:169

Frontmatter metadata

***

### slug?

> `optional` __slug?__: `string`

Defined in: src/types/Page.ts:190

URL slug (from metadata)

***

### title

> __title__: `string`

Defined in: src/types/Page.ts:160

Page title

***

### uuid

> __uuid__: `string`

Defined in: src/types/Page.ts:163

Unique identifier (UUID v4)
