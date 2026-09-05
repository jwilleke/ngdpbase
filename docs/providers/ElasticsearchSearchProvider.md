---
name: ElasticsearchSearchProvider
description: Elasticsearch backend for SearchManager — full-text and (optionally) vector search over pages
dateModified: '2026-05-14'
category: providers
code: src/providers/ElasticsearchSearchProvider.ts
---

# ElasticsearchSearchProvider

__Quick Reference__ | [Complete Guide](ElasticsearchSearchProvider-Complete-Guide.md)

__Module:__ `src/providers/ElasticsearchSearchProvider.ts`
__Type:__ Search Provider
__Extends:__ BaseSearchProvider
__Status:__ Production Ready — opt-in

## Overview

ElasticsearchSearchProvider is an optional replacement for LunrSearchProvider, backed by
Elasticsearch. It is suitable for wikis with 10,000+ pages or multi-node deployments where
Lunr's in-memory rebuild cost becomes a problem.

Lunr remains the default. Switch by setting one config key — no code changes required.

## Key Features

- __Elasticsearch-backed__ — persistent index survives restarts without a cold rebuild
- __Incremental updates__ — `updatePageInIndex()` writes a single document; no full rebuild
- __Field aggregations__ — `getAllCategories()`, `getAllUserKeywords()`, `getAllSystemKeywords()`
- __Private-page access control__ — mirrors LunrSearchProvider; `isPrivate` + `audience` fields
- __Auto-tagging ready__ — `systemKeywords` field pre-wired for #507 Transformers.js auto-tags
- __Backup / restore__ — scroll-based backup; bulk restore

## Activation

```json
"ngdpbase.search.provider": "elasticsearchsearchprovider"
```

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `ngdpbase.search.provider.elasticsearch.url` | `http://localhost:9200` | Elasticsearch base URL. Subject to the egress policy (#1188): `localhost` is never permitted, a LAN node needs its prefix in `ngdpbase.security.egress.allowed-ranges` |
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
