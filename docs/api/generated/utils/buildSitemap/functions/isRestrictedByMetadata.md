[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / isRestrictedByMetadata

# Function: isRestrictedByMetadata()

> __isRestrictedByMetadata__(`meta`): `boolean`

Defined in: src/utils/buildSitemap.ts:122

Whether a page's own frontmatter restricts it to named principals (#885).

The page index carries a denormalised `audienceRoles` copy of this, and
relying on that copy alone was a LEAK: it is written on save, so any page not
re-saved since #754 has the restriction in frontmatter and nothing in the
index. On jimstest that was 345 of 347 audience-restricted pages — personal
journal entries — which sailed into a generated sitemap during development.
The field's own docs say it plainly: "the page-frontmatter is the source of
truth". So the index is used to enumerate, and this decides.

Deliberately blunt: ANY audience excludes the page, whatever it says.
A page's `access` field is not read since #2255. An anonymous visitor is in no audience and holds no role, so a rule
that happens to be permissive is not worth parsing for — omitting a public
page costs a missed crawl, listing a restricted one leaks its existence.

## Parameters

### meta

[`RestrictableMetadata`](../interfaces/RestrictableMetadata.md) \| `null` \| `undefined`

## Returns

`boolean`
