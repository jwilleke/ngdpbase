[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageToArticle](../README.md) / pageToArticle

# Function: pageToArticle()

> __pageToArticle__(`pageName`, `metadata`, `options?`): [`Article`](../../../types/Schema/interfaces/Article.md)

Defined in: src/utils/pageToArticle.ts:80

Build the internal `Article` record for a single page.

## Parameters

### pageName

`string`

Page title — used as `name` and to compute `@id` / `url`.
                   For slug-bearing pages, pass the slug from `metadata.slug`
                   so the URL stays stable across renames.

### metadata

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null` \| `undefined`

Frontmatter object (typically from `PageManager.getPageMetadata`).

### options?

[`PageToArticleOptions`](../interfaces/PageToArticleOptions.md) = `{}`

Optional `baseUrl` and `autoTaggedKeywords`.

## Returns

[`Article`](../../../types/Schema/interfaces/Article.md)
