[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Page](../README.md) / PageSaveOptions

# Interface: PageSaveOptions

Defined in: [src/types/Page.ts:129](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L129)

Page save options

Options passed when saving a page to control versioning, author tracking,
and other save behaviors.

## Properties

### additionalMetadata?

> `optional` __additionalMetadata__: `Partial`\<[`PageFrontmatter`](PageFrontmatter.md)\>

Defined in: [src/types/Page.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L143)

Additional metadata to merge

***

### author?

> `optional` __author__: `string`

Defined in: [src/types/Page.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L131)

User ID performing the save

***

### changeType?

> `optional` __changeType__: `"create"` \| `"update"` \| `"minor"` \| `"major"`

Defined in: [src/types/Page.ts:134](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L134)

Change type (create, update, minor, major)

***

### createVersion?

> `optional` __createVersion__: `boolean`

Defined in: [src/types/Page.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L140)

Whether to create a version entry

***

### message?

> `optional` __message__: `string`

Defined in: [src/types/Page.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Page.ts#L137)

Commit message/change description
