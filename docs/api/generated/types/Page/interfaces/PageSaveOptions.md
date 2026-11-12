[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Page](../README.md) / PageSaveOptions

# Interface: PageSaveOptions

Defined in: src/types/Page.ts:199

Page save options

Options passed when saving a page to control versioning, author tracking,
and other save behaviors.

## Properties

### additionalMetadata?

> `optional` __additionalMetadata?__: `Partial`\<[`PageFrontmatter`](PageFrontmatter.md)\>

Defined in: src/types/Page.ts:213

Additional metadata to merge

***

### author?

> `optional` __author?__: `string`

Defined in: src/types/Page.ts:201

User ID performing the save

***

### changeType?

> `optional` __changeType?__: `"major"` \| `"minor"` \| `"update"` \| `"create"`

Defined in: src/types/Page.ts:204

Change type (create, update, minor, major)

***

### createVersion?

> `optional` __createVersion?__: `boolean`

Defined in: src/types/Page.ts:210

Whether to create a version entry

***

### message?

> `optional` __message?__: `string`

Defined in: src/types/Page.ts:207

Commit message/change description

***

### moveFrom?

> `optional` __moveFrom?__: `string`

Defined in: src/types/Page.ts:224

The private name the page is at now, when this save moves it into
another of its owner's vaults (#1505). The page, its history and its
index entry go with it. Only a save that says so changes a page's vault;
one that names another vault without it is refused.

***

### preserveLastModified?

> `optional` __preserveLastModified?__: `boolean`

Defined in: src/types/Page.ts:216

Preserve lastModified from metadata instead of setting to now (for import/migration use)
