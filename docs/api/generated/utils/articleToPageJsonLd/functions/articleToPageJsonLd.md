[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/articleToPageJsonLd](../README.md) / articleToPageJsonLd

# Function: articleToPageJsonLd()

> __articleToPageJsonLd__(`article`, `schemaTypeMap?`): [`PageJsonLd`](../../buildPageJsonLd/interfaces/PageJsonLd.md)

Defined in: src/utils/articleToPageJsonLd.ts:55

Convert an internal `Article` (from `pageToArticle` / `PageManager.toCreativeWork`)
into the JSON-LD-render shape `PageJsonLd` consumed by `view.ejs` and by
the `/view/<slug>` `Accept: application/ld+json` content-negotiation
branch. Pure function, no I/O.

## Parameters

### article

[`Article`](../../../types/Schema/interfaces/Article.md)

Internal Article record from `pageToArticle`.

### schemaTypeMap?

`Record`\<`string`, `string`\>

Optional `system-category` → schema.org subtype
                        map (typically resolved from
                        `ngdpbase.schema-types` config per #791). When
                        provided and the article's `ngdp:category` matches
                        an entry, the output `@type` is overridden with
                        the mapped value (e.g. `'BlogPosting'`); otherwise
                        the internal `article['@type']` is passed through
                        (always `'Article'` for pages today — the subtype
                        override is "render-time-only" per #791 D1=A).

## Returns

[`PageJsonLd`](../../buildPageJsonLd/interfaces/PageJsonLd.md)
