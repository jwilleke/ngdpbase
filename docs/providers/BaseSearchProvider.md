---
name: BaseSearchProvider
description: Abstract interface for search providers — extension surface for new search engines (Lunr, Elasticsearch, vector, etc.)
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseSearchProvider.ts
---

# BaseSearchProvider

Abstract contract for search engines. Implement this to plug a different search backend into ngdpbase. `SearchManager` delegates `indexPage`, `removeFromIndex`, `search`, `searchByCategory`, etc. to the configured provider.

Follows the same provider pattern as `BasePageProvider`, `BaseAttachmentProvider`, `BaseCacheProvider`, `BaseAuditProvider`.

## Implementations

- [LunrSearchProvider](LunrSearchProvider.md) — in-memory Lunr.js index (default)
- [ElasticsearchSearchProvider](ElasticsearchSearchProvider.md) — external Elasticsearch cluster (addon)

## Contract

- `indexPage(pageData)` — add/update a page in the index
- `removeFromIndex(pageName)` — drop a page
- `search(query, options?)` — full-text search
- `searchByCategory(category)` — category-filtered search
- `advancedSearch(criteria)` — multi-criteria query (keywords, category, audience filter, etc.)
- `getStats()` — index size, doc count
- `getProviderInfo()` — diagnostics

## See Also

- `src/managers/SearchManager.ts` — consumer
- `addons/elasticsearch/` — Elasticsearch provider addon
- Issue #102 — provider-pattern groundwork
- Issue #550 — extending elasticsearch beyond keyword search (vector / hybrid)
