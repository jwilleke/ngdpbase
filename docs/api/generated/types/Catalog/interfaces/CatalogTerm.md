[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Catalog](../README.md) / CatalogTerm

# Interface: CatalogTerm

Defined in: src/types/Catalog.ts:12

A single term in the controlled vocabulary.

## Properties

### category?

> `optional` __category?__: `"access"` \| `"general"` \| `"subject"` \| `"status"` \| `"content-type"` \| `"workflow-status"` \| `"provenance"`

Defined in: src/types/Catalog.ts:24

Semantic category of the term

***

### default?

> `optional` __default?__: `boolean`

Defined in: src/types/Catalog.ts:26

True if this is the default term for its category

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Catalog.ts:22

Human-readable description (#894 — SKOS skos:definition candidate)

***

### enabled?

> `optional` __enabled?__: `boolean`

Defined in: src/types/Catalog.ts:28

False to hide the term from pickers without deleting it from config

***

### label

> __label__: `string`

Defined in: src/types/Catalog.ts:16

Human-readable display label

***

### source?

> `optional` __source?__: `string`

Defined in: src/types/Catalog.ts:20

Provenance — 'config' | 'wikidata' | 'lcsh' | 'getty-aat' | 'usgs' etc.

***

### term

> __term__: `string`

Defined in: src/types/Catalog.ts:14

Canonical machine-readable key (e.g. 'geology', 'draft')

***

### uri?

> `optional` __uri?__: `string`

Defined in: src/types/Catalog.ts:18

Optional Linked-Data URI — e.g. <https://www.wikidata.org/wiki/Q1069>
