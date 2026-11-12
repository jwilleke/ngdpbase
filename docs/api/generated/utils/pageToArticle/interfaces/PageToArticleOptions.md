[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageToArticle](../README.md) / PageToArticleOptions

# Interface: PageToArticleOptions

Defined in: src/utils/pageToArticle.ts:56

## Properties

### autoTaggedKeywords?

> `optional` __autoTaggedKeywords?__: `string`[]

Defined in: src/utils/pageToArticle.ts:68

Auto-tagged keywords from the search index (#507 / TaggingService). Merged
with frontmatter `user-keywords` + `system-keywords` and deduplicated.

***

### baseUrl?

> `optional` __baseUrl?__: `string`

Defined in: src/utils/pageToArticle.ts:62

Canonical base URL (e.g. `https://wiki.example.com`). When set, `@id` and
`url` are absolute; otherwise they're path-only `/view/<slug>` (still a
valid IRI per JSON-LD 1.1).
