---
name: LunrSearchProvider
description: In-memory Lunr.js search index — default backend for SearchManager
dateModified: '2026-05-28'
category: providers
code: src/providers/LunrSearchProvider.ts
---

# LunrSearchProvider

Default search backend. Builds an in-memory Lunr.js index covering page title + content + system-keywords + user-keywords + system-category, with per-doc denormalised fields for the privacy + audience filter at search time.

## Configuration

- `ngdpbase.search.provider` = `lunr` (default)
- `ngdpbase.search.lunr.persist-path` — optional path to persist the serialized index (avoids cold-start rebuild)

## Index Document Shape (high level)

- `id` — page UUID
- `title`, `name`, `description` — searchable text
- `content` — page body (markdown source)
- `category` — `system-category` value
- `keywords` — `user-keywords` joined
- `isPrivate` — boolean (#802: read from `private:true` only; `system-location` fallback retired)
- `creator` — owner for private-page ACL gating

## Trade-offs vs Elasticsearch addon

| Provider | When |
|---|---|
| __LunrSearchProvider__ | Small-medium instances (≲ 50K pages); zero infrastructure; in-process |
| [ElasticsearchSearchProvider](ElasticsearchSearchProvider.md) | Large datasets; want vector / hybrid search (#550); already running an ES cluster |

## See Also

- [BaseSearchProvider](BaseSearchProvider.md) — the contract
- `src/managers/SearchManager.ts` — consumer
- Issue #802 — privacy-signal canonicalisation (slug-equivalent for search)
