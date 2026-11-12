[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildConceptSchemeJsonLd](../README.md) / BuildConceptSchemeOptions

# Interface: BuildConceptSchemeOptions

Defined in: src/utils/buildConceptSchemeJsonLd.ts:43

## Properties

### baseUrl?

> `optional` __baseUrl?__: `string`

Defined in: src/utils/buildConceptSchemeJsonLd.ts:49

Canonical base URL (e.g. `https://wiki.example.com`). When omitted, the
scheme + concept `@id`s use the relative-path form
`/api/catalog/vocabulary/<scheme>` — still valid JSON-LD (relative IRI).
