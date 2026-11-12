[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildPageJsonLd](../README.md) / buildPageJsonLd

# Function: buildPageJsonLd()

> __buildPageJsonLd__(`pageName`, `metadata`, `options?`): [`PageJsonLd`](../interfaces/PageJsonLd.md)

Defined in: src/utils/buildPageJsonLd.ts:154

Build the JSON-LD payload for a single page.

Thin compose: `pageToArticle()` produces the internal `Article` from
frontmatter, then `articleToPageJsonLd()` converts to the render shape.
See `pageToArticle.ts` and `articleToPageJsonLd.ts` for the per-mapping
detail.

## Parameters

### pageName

`string`

### metadata

[`PageMetadataLike`](../interfaces/PageMetadataLike.md) \| `null` \| `undefined`

### options?

[`BuildPageJsonLdOptions`](../interfaces/BuildPageJsonLdOptions.md) = `{}`

## Returns

[`PageJsonLd`](../interfaces/PageJsonLd.md)
