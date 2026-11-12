[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / isPushedPage

# Function: isPushedPage()

> __isPushedPage__(`meta`, `pushedCategories`): `boolean`

Defined in: src/utils/buildSitemap.ts:145

Whether a page is a pushed page (#2255): one in a system-category that
policy reserves to `pushed-pages-edit` (system, documentation and addon as
shipped), the pages ngdpbase and its add-ons push to a site. They are left
out of the sitemap, as they were while every one of them carried the
`access:` stamp that excluded it. Which of them should be indexed is #2260.

## Parameters

### meta

[`RestrictableMetadata`](../interfaces/RestrictableMetadata.md) \| `null` \| `undefined`

The page's frontmatter

### pushedCategories

readonly `string`[]

The categories policy reserves (`PolicyDecisionPoint.categoriesGranting`)

## Returns

`boolean`
