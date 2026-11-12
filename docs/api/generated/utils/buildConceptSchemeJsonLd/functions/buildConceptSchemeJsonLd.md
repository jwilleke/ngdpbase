[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildConceptSchemeJsonLd](../README.md) / buildConceptSchemeJsonLd

# Function: buildConceptSchemeJsonLd()

> __buildConceptSchemeJsonLd__(`schemeId`, `displayName`, `terms`, `options?`): [`SkosConceptScheme`](../interfaces/SkosConceptScheme.md)

Defined in: src/utils/buildConceptSchemeJsonLd.ts:60

Build the SKOS ConceptScheme JSON-LD shape for a given vocabulary provider.

## Parameters

### schemeId

`string`

The CatalogProvider id (e.g. `default`, addon ids).

### displayName

`string`

Human-readable scheme name (used as `prefLabel`).

### terms

[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]

The provider's terms — typically `provider.getTerms()`.

### options?

[`BuildConceptSchemeOptions`](../interfaces/BuildConceptSchemeOptions.md) = `{}`

## Returns

[`SkosConceptScheme`](../interfaces/SkosConceptScheme.md)
