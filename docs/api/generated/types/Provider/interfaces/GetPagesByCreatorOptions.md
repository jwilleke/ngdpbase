[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / GetPagesByCreatorOptions

# Interface: GetPagesByCreatorOptions

Defined in: src/types/Provider.ts:120

Options for [PageProvider.getPagesByCreator](PageProvider.md#getpagesbycreator) (#640).

## Properties

### limit?

> `optional` __limit?__: `number`

Defined in: src/types/Provider.ts:122

Maximum number of entries returned. Default 1000 (intent: full per-user list).

***

### onlyPrivate?

> `optional` __onlyPrivate?__: `boolean`

Defined in: src/types/Provider.ts:124

Only include pages where `isPrivate === true`.

***

### references?

> `optional` __references?__: `string`[]

Defined in: src/types/Provider.ts:142

The stored values that name the user (#2097): their identity

#### Id

and,
for pages not yet converted, their username (`IdentityManager.referencesOf`).
Set by PageManager; a provider compares `author` against these. Default `[username]`.

***

### sortBy?

> `optional` __sortBy?__: `"lastModified-desc"` \| `"title-asc"`

Defined in: src/types/Provider.ts:126

Sort order. Default `lastModified-desc`.

***

### systemKeywords?

> `optional` __systemKeywords?__: `string`[]

Defined in: src/types/Provider.ts:136

Only include pages carrying at least ONE of these `system-keywords` (#1004).
Matched case-insensitively. Omitted or empty means no keyword filter.

Read from page frontmatter, not from a denormalised index field: the page
index has no system-keywords column, and adding one would leave every
pre-existing page invisible to this filter until its next save (the #1003
failure mode). Frontmatter is the source of truth and needs no back-fill.
