[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Page](../README.md) / PageFrontmatter

# Interface: PageFrontmatter

Defined in: [src/types/Page.ts:15](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L15)

Page frontmatter metadata

Metadata stored in YAML frontmatter at the top of each markdown file.
All pages must have at minimum: title, uuid, and lastModified.

## Indexable

\[`key`: `string`\]: `unknown`

Additional custom metadata

## Properties

### author?

> `optional` __author__: `string`

Defined in: [src/types/Page.ts:38](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L38)

Page author (user ID or 'system')

***

### category?

> `optional` __category__: `string`

Defined in: [src/types/Page.ts:29](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L29)

User-defined category (optional)

***

### editor?

> `optional` __editor__: `string`

Defined in: [src/types/Page.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L41)

Last editor (user ID or 'system')

***

### lastModified

> __lastModified__: `string`

Defined in: [src/types/Page.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L23)

Last modification timestamp (ISO 8601 format)

***

### order?

> `optional` __order__: `number`

Defined in: [src/types/Page.ts:53](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L53)

Sort order for navigation

***

### parent?

> `optional` __parent__: `string`

Defined in: [src/types/Page.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L50)

Parent page UUID for hierarchical structure

***

### published?

> `optional` __published__: `boolean`

Defined in: [src/types/Page.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L47)

Whether page is published/visible

***

### slug?

> `optional` __slug__: `string`

Defined in: [src/types/Page.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L35)

URL slug for pretty URLs

***

### system-category?

> `optional` __system-category__: `string`

Defined in: [src/types/Page.ts:26](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L26)

System-defined category (optional)

***

### template?

> `optional` __template__: `string`

Defined in: [src/types/Page.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L44)

Page template to use for rendering

***

### title

> __title__: `string`

Defined in: [src/types/Page.ts:17](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L17)

Page title (required)

***

### user-keywords?

> `optional` __user-keywords__: `string`[]

Defined in: [src/types/Page.ts:32](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L32)

User-defined keywords/tags

***

### uuid

> __uuid__: `string`

Defined in: [src/types/Page.ts:20](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L20)

Unique identifier (UUID v4)
