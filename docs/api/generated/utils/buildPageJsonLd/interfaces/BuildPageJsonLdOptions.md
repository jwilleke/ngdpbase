[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildPageJsonLd](../README.md) / BuildPageJsonLdOptions

# Interface: BuildPageJsonLdOptions

Defined in: src/utils/buildPageJsonLd.ts:93

## Properties

### autoTaggedKeywords?

> `optional` __autoTaggedKeywords?__: `string`[]

Defined in: src/utils/buildPageJsonLd.ts:105

Auto-tagged keywords from the search index (#507 / TaggingService). Merged
with frontmatter `user-keywords` + `system-keywords` and deduplicated.

***

### baseUrl?

> `optional` __baseUrl?__: `string`

Defined in: src/utils/buildPageJsonLd.ts:100

Canonical base URL (e.g. `https://wiki.example.com`). Optional — when
absent, `@id` and `url` are emitted as the path-only form `/view/<slug>`
which is still valid JSON-LD (relative IRI). Set this from the
`Host` request header or `ngdpbase.base-url` config when one is configured.
