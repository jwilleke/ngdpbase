[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / PinnedItem

# Interface: PinnedItem

Defined in: src/types/User.ts:18

An item pinned to the user's My Links sidebar section. The shape is unified
across wiki pages and arbitrary app-route bookmarks (e.g. /my/journal,
/profile, /search?q=foo). `url` is the canonical identifier; `pageName` is
carried for wiki pages so the rendering path can still use page-aware
affordances when relevant.

Legacy entries (`{pageName, title}` only, no `url`) are normalised at read
time by normalizePinnedItem in src/utils/pinnedItems.ts.

## Properties

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/types/User.ts:21

***

### pinnedAt?

> `optional` __pinnedAt?__: `string`

Defined in: src/types/User.ts:22

***

### title

> __title__: `string`

Defined in: src/types/User.ts:20

***

### url

> __url__: `string`

Defined in: src/types/User.ts:19
