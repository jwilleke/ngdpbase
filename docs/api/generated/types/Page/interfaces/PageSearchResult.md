[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / PageSearchResult

# Interface: PageSearchResult

Defined in: src/types/Page.ts:232

Page search result

Extended page info with search relevance scoring and highlighting.

## Extends

- [`PageInfo`](PageInfo.md)

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Page.ts:181

Page author (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`author`](PageInfo.md#author)

***

### category?

> `optional` __category?__: `string`

Defined in: src/types/Page.ts:187

Category (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`category`](PageInfo.md#category)

***

### created?

> `optional` __created?__: `string`

Defined in: src/types/Page.ts:178

Creation timestamp (from metadata, #754)

#### Inherited from

[`PageInfo`](PageInfo.md).[`created`](PageInfo.md#created)

***

### editor?

> `optional` __editor?__: `string`

Defined in: src/types/Page.ts:184

Last editor (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`editor`](PageInfo.md#editor)

***

### filePath

> __filePath__: `string`

Defined in: src/types/Page.ts:166

Absolute file path to the page file

#### Inherited from

[`PageInfo`](PageInfo.md).[`filePath`](PageInfo.md#filepath)

***

### highlights?

> `optional` __highlights?__: `string`[]

Defined in: src/types/Page.ts:237

Highlighted snippets from content

***

### lastModified?

> `optional` __lastModified?__: `string`

Defined in: src/types/Page.ts:175

Last modification timestamp (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`lastModified`](PageInfo.md#lastmodified)

***

### location?

> `optional` __location?__: `"pages"` \| `"required-pages"`

Defined in: src/types/Page.ts:172

Location type

#### Inherited from

[`PageInfo`](PageInfo.md).[`location`](PageInfo.md#location)

***

### matchedKeywords?

> `optional` __matchedKeywords?__: `string`[]

Defined in: src/types/Page.ts:240

Matched keywords

***

### metadata

> __metadata__: [`PageFrontmatter`](PageFrontmatter.md)

Defined in: src/types/Page.ts:169

Frontmatter metadata

#### Inherited from

[`PageInfo`](PageInfo.md).[`metadata`](PageInfo.md#metadata)

***

### score

> __score__: `number`

Defined in: src/types/Page.ts:234

Search relevance score (0-1)

***

### slug?

> `optional` __slug?__: `string`

Defined in: src/types/Page.ts:190

URL slug (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`slug`](PageInfo.md#slug)

***

### title

> __title__: `string`

Defined in: src/types/Page.ts:160

Page title

#### Inherited from

[`PageInfo`](PageInfo.md).[`title`](PageInfo.md#title)

***

### uuid

> __uuid__: `string`

Defined in: src/types/Page.ts:163

Unique identifier (UUID v4)

#### Inherited from

[`PageInfo`](PageInfo.md).[`uuid`](PageInfo.md#uuid)
