---
name: ElasticsearchSearchProvider
description: Elasticsearch backend for SearchManager — full-text and (optionally) vector search over pages
dateModified: '2026-05-14'
category: providers
code: src/providers/ElasticsearchSearchProvider.ts
---

# ElasticsearchSearchProvider

**Quick Reference** | [Complete Guide](ElasticsearchSearchProvider-Complete-Guide.md)

**Module:** `src/providers/ElasticsearchSearchProvider.ts`
**Type:** Search Provider
**Extends:** BaseSearchProvider
**Status:** Production Ready — opt-in

## Overview

ElasticsearchSearchProvider is an optional replacement for LunrSearchProvider, backed by
Elasticsearch. It is suitable for wikis with 10,000+ pages or multi-node deployments where
Lunr's in-memory rebuild cost becomes a problem.

Lunr remains the default. Switch by setting one config key — no code changes required.

## Key Features

- **Elasticsearch-backed** — persistent index survives restarts without a cold rebuild
- **Incremental updates** — `updatePageInIndex()` writes a single document; no full rebuild
- **Field aggregations** — `getAllCategories()`, `getAllUserKeywords()`, `getAllSystemKeywords()`
- **Private-page access control** — mirrors LunrSearchProvider; `isPrivate` + `audience` fields
- **Auto-tagging ready** — `systemKeywords` field pre-wired for #507 Transformers.js auto-tags
- **Backup / restore** — scroll-based backup; bulk restore

## Activation

```json
"ngdpbase.search.provider": "elasticsearchsearchprovider"
```

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `ngdpbase.search.provider.elasticsearch.url` | `http://localhost:9200` | Elasticsearch base URL |
| `ngdpbase.search.provider.elasticsearch.indexname` | `ngdpbase-pages` | ES index name |
| `ngdpbase.search.provider.elasticsearch.connecttimeout` | `5000` | Connect timeout (ms) |
| `ngdpbase.search.provider.elasticsearch.requesttimeout` | `30000` | Request timeout (ms) |

## Field Mapping

| ES field | Front-matter key | Purpose |
| --- | --- | --- |
| `systemCategory` | `system-category` | Storage routing; facet filter |
| `systemKeywords` | `system-keywords` | System-assigned classification |
| `userKeywords` | `user-keywords` | User-assigned from controlled vocabulary |
| `isPrivate` | `system-location: private` | Private page flag |
| `audience` | `audience` | Principals allowed to view private pages |

Note: the legacy Lunr `tags` field is intentionally absent — no pages use `tags:` in front matter.

## Index

- Name: `ngdpbase-pages`
- Distinct from the sist2 addon's `ngdpbase.addons.elasticsearch.es-index`
- Created automatically on first `buildIndex()` call

## Related Issues

- #189 — Lunr alternatives
- #504 — Elasticsearch search integration
- #507 — Content-based auto-tagging (`systemKeywords` pre-wired)
