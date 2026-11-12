[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / WikiPage

# Interface: WikiPage

Defined in: src/types/Page.ts:132

Complete wiki page object

Represents a full page with content and metadata. This is the primary
data structure returned by PageProvider.getPage().

## Properties

### content

> __content__: `string`

Defined in: src/types/Page.ts:140

Markdown content (without frontmatter)

***

### filePath

> __filePath__: `string`

Defined in: src/types/Page.ts:146

Absolute file path to the page file

***

### location?

> `optional` __location?__: `"pages"` \| `"required-pages"`

Defined in: src/types/Page.ts:149

Location type (pages or required-pages)

***

### metadata

> __metadata__: [`PageFrontmatter`](PageFrontmatter.md)

Defined in: src/types/Page.ts:143

Frontmatter metadata

***

### title

> __title__: `string`

Defined in: src/types/Page.ts:134

Page title

***

### uuid

> __uuid__: `string`

Defined in: src/types/Page.ts:137

Unique identifier (UUID v4)
