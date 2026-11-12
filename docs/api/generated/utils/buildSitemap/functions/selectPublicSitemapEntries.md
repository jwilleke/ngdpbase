[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / selectPublicSitemapEntries

# Function: selectPublicSitemapEntries()

> __selectPublicSitemapEntries__(`entries`, `baseUrl`): [`SitemapEntry`](../interfaces/SitemapEntry.md)[]

Defined in: src/utils/buildSitemap.ts:165

Index-level pre-filter for sitemap candidates (#885).

Cheap and in-memory, but NOT sufficient on its own — see
[isRestrictedByMetadata](isRestrictedByMetadata.md) for why the index's `audienceRoles` cannot be
trusted as the last word. The caller must verify each survivor against its
real frontmatter; this pass exists to drop the obvious cases and to build the
URL and lastmod, not to make the security decision.

Also does not model Tier 2 global policy — whether anonymous `page-read` is
allowed at all, and whether any policy is page-scoped. The route settles that
before calling.

## Parameters

### entries

[`SitemapIndexEntry`](../interfaces/SitemapIndexEntry.md)[]

### baseUrl

`string`

## Returns

[`SitemapEntry`](../interfaces/SitemapEntry.md)[]
