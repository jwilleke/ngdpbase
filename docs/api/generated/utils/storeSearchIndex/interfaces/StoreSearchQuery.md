[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/storeSearchIndex](../README.md) / StoreSearchQuery

# Interface: StoreSearchQuery

Defined in: src/utils/storeSearchIndex.ts:42

What a caller asks a store's index. Every field is optional; all of them narrow.

## Properties

### categories?

> `optional` __categories?__: `string`[]

Defined in: src/utils/storeSearchIndex.ts:46

`system-category` values; a document matches when it carries one of them.

***

### query?

> `optional` __query?__: `string`

Defined in: src/utils/storeSearchIndex.ts:44

Free text. Empty means "every document", as the shared no-text branch does.

***

### searchIn?

> `optional` __searchIn?__: `string`[]

Defined in: src/utils/storeSearchIndex.ts:50

Which fields the free text is matched in: `title`, `content`, `category`, `keywords`, or `all`.

***

### snippetLength?

> `optional` __snippetLength?__: `number`

Defined in: src/utils/storeSearchIndex.ts:52

Longest snippet returned. Default 200, as the Lunr provider's default is.

***

### userKeywords?

> `optional` __userKeywords?__: `string`[]

Defined in: src/utils/storeSearchIndex.ts:48

`user-keywords` / tags; a document matches when it carries one of them.
