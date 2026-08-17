[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Page](../README.md) / PageSearchResult

# Interface: PageSearchResult

Defined in: [src/types/Page.ts:151](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L151)

Page search result

Extended page info with search relevance scoring and highlighting.

## Extends

- [`PageInfo`](PageInfo.md)

## Properties

### author?

> `optional` __author__: `string`

Defined in: [src/types/Page.ts:111](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L111)

Page author (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`author`](PageInfo.md#author)

***

### category?

> `optional` __category__: `string`

Defined in: [src/types/Page.ts:117](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L117)

Category (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`category`](PageInfo.md#category)

***

### editor?

> `optional` __editor__: `string`

Defined in: [src/types/Page.ts:114](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L114)

Last editor (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`editor`](PageInfo.md#editor)

***

### filePath

> __filePath__: `string`

Defined in: [src/types/Page.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L99)

Absolute file path to the page file

#### Inherited from

[`PageInfo`](PageInfo.md).[`filePath`](PageInfo.md#filepath)

***

### highlights?

> `optional` __highlights__: `string`[]

Defined in: [src/types/Page.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L156)

Highlighted snippets from content

***

### lastModified?

> `optional` __lastModified__: `string`

Defined in: [src/types/Page.ts:108](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L108)

Last modification timestamp (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`lastModified`](PageInfo.md#lastmodified)

***

### location?

> `optional` __location__: `"pages"` \| `"required-pages"`

Defined in: [src/types/Page.ts:105](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L105)

Location type

#### Inherited from

[`PageInfo`](PageInfo.md).[`location`](PageInfo.md#location)

***

### matchedKeywords?

> `optional` __matchedKeywords__: `string`[]

Defined in: [src/types/Page.ts:159](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L159)

Matched keywords

***

### metadata

> __metadata__: [`PageFrontmatter`](PageFrontmatter.md)

Defined in: [src/types/Page.ts:102](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L102)

Frontmatter metadata

#### Inherited from

[`PageInfo`](PageInfo.md).[`metadata`](PageInfo.md#metadata)

***

### score

> __score__: `number`

Defined in: [src/types/Page.ts:153](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L153)

Search relevance score (0-1)

***

### slug?

> `optional` __slug__: `string`

Defined in: [src/types/Page.ts:120](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L120)

URL slug (from metadata)

#### Inherited from

[`PageInfo`](PageInfo.md).[`slug`](PageInfo.md#slug)

***

### title

> __title__: `string`

Defined in: [src/types/Page.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L93)

Page title

#### Inherited from

[`PageInfo`](PageInfo.md).[`title`](PageInfo.md#title)

***

### uuid

> __uuid__: `string`

Defined in: [src/types/Page.ts:96](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L96)

Unique identifier (UUID v4)

#### Inherited from

[`PageInfo`](PageInfo.md).[`uuid`](PageInfo.md#uuid)
