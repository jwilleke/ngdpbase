[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Page](../README.md) / WikiPage

# Interface: WikiPage

Defined in: [src/types/Page.ts:65](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L65)

Complete wiki page object

Represents a full page with content and metadata. This is the primary
data structure returned by PageProvider.getPage().

## Properties

### content

> __content__: `string`

Defined in: [src/types/Page.ts:73](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L73)

Markdown content (without frontmatter)

***

### filePath

> __filePath__: `string`

Defined in: [src/types/Page.ts:79](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L79)

Absolute file path to the page file

***

### location?

> `optional` __location__: `"pages"` \| `"required-pages"`

Defined in: [src/types/Page.ts:82](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L82)

Location type (pages or required-pages)

***

### metadata

> __metadata__: [`PageFrontmatter`](PageFrontmatter.md)

Defined in: [src/types/Page.ts:76](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L76)

Frontmatter metadata

***

### title

> __title__: `string`

Defined in: [src/types/Page.ts:67](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L67)

Page title

***

### uuid

> __uuid__: `string`

Defined in: [src/types/Page.ts:70](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L70)

Unique identifier (UUID v4)
