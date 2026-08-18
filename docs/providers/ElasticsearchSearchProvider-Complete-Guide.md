# ElasticsearchSearchProvider — Complete Guide

[Quick Reference](ElasticsearchSearchProvider.md)

__Module:__ `src/providers/ElasticsearchSearchProvider.ts`
__Extends:__ `src/providers/BaseSearchProvider.ts`

---

## Overview

ElasticsearchSearchProvider backs ngdpbase full-text search with Elasticsearch. It is an
optional, opt-in replacement for the default LunrSearchProvider and is designed for wikis that
have outgrown Lunr:

| Situation | Recommended provider |
| --- | --- |
| < 10,000 pages, single node | `LunrSearchProvider` (default) |
| > 10,000 pages or multi-node | `ElasticsearchSearchProvider` |

Switching is a single config key change — no code modifications required.

---

## Activation

Add to your instance `app-custom-config.json`:

```json
"ngdpbase.search.provider": "elasticsearchsearchprovider",
"ngdpbase.search.provider.elasticsearch.url": "http://192.168.68.71:9200"
```

All other keys default to sensible values (see below).

---

## Configuration Reference

| Key | Default | Description |
| --- | --- | --- |
| `ngdpbase.search.provider` | `lunrsearchprovider` | Set to `elasticsearchsearchprovider` to activate |
| `ngdpbase.search.provider.elasticsearch.url` | `http://localhost:9200` | Elasticsearch base URL |
| `ngdpbase.search.provider.elasticsearch.indexname` | `ngdpbase-pages` | Index name — distinct from the sist2 addon index |
| `ngdpbase.search.provider.elasticsearch.connecttimeout` | `5000` | Connect timeout in ms |
| `ngdpbase.search.provider.elasticsearch.requesttimeout` | `30000` | Request timeout in ms |

---

## ES Index

- __Name:__ `ngdpbase-pages` (configurable)
- __Created:__ automatically on first `buildIndex()` call
- __Distinct from:__ `ngdpbase.addons.elasticsearch.es-index` (sist2 asset index)

### Mapping

```json
{
  "mappings": {
    "properties": {
      "name":           { "type": "keyword" },
      "title":          { "type": "text", "analyzer": "english", "fields": { "keyword": { "type": "keyword" } } },
      "content":        { "type": "text", "analyzer": "english" },
      "systemCategory": { "type": "keyword" },
      "systemKeywords": { "type": "keyword" },
      "userKeywords":   { "type": "keyword" },
      "author":         { "type": "keyword" },
      "editor":         { "type": "keyword" },
      "lastModified":   { "type": "date" },
      "uuid":           { "type": "keyword" },
      "isPrivate":      { "type": "boolean" },
      "audience":       { "type": "keyword" }
    }
  }
}
```

### Field → Metadata Source

| ES field | Front-matter key | Notes |
| --- | --- | --- |
| `systemCategory` | `system-category` | Storage routing (`general`, `addon`, `system`, …) |
| `systemKeywords` | `system-keywords` | System-assigned classification; home for #507 auto-tags |
| `userKeywords` | `user-keywords` | User-assigned from the `ngdpbase.user-keywords` vocabulary |
| `isPrivate` | `system-location: private` | Derived — true when storage location is `private` |
| `audience` | `audience` | Principals allowed to view this page when private |

The legacy Lunr `tags` field is omitted — no pages use `tags:` in front matter.

---

## Method Implementations

| Method | ES operation |
| --- | --- |
| `initialize()` | Create `Client`; ensure index exists (create with mapping if absent) |
| `buildIndex()` | `getAllPages()` + `getPage()` → bulk index in 200-doc batches |
| `search(query, options)` | `multi_match` on title/content/userKeywords/systemKeywords; privacy filter |
| `advancedSearch(criteria)` | `bool` with `must` (text), `filter` (category, keywords, date, author/editor) |
| `updatePageInIndex(name, data)` | `client.index()` — single document upsert |
| `removePageFromIndex(name)` | `client.delete()` — ignores 404 |
| `searchByCategory(category)` | `term: { systemCategory }` |
| `searchByUserKeywords(kw)` | `term: { userKeywords }` |
| `getAllCategories()` | `terms` aggregation on `systemCategory`, size 100 |
| `getAllUserKeywords()` | `terms` aggregation on `userKeywords`, size 500 |
| `getAllSystemKeywords()` | `terms` aggregation on `systemKeywords`, size 500 |
| `getSuggestions(partial)` | `match_phrase_prefix` on `title.keyword` |
| `suggestSimilarPages(name, limit)` | `more_like_this` on title + content |
| `getStatistics()` | `count` API + `indices.stats` |
| `getDocumentCount()` | `count` API |
| `isHealthy()` | `client.ping()` |
| `close()` | `client.close()` |
| `backup()` | Scroll all docs, return as JSON payload |
| `restore(data)` | Bulk-index from backup payload |

---

## Private Page Access Control

Documents store `isPrivate: boolean` and `audience: string[]`.

At query time a `bool.filter` is injected:

```json
{
  "bool": {
    "should": [
      { "term": { "isPrivate": false } },
      { "terms": { "audience": ["<role1>", "<username>", ...] } }
    ],
    "minimum_should_match": 1
  }
}
```

When no user context is present (anonymous request), only `isPrivate: false` pages are returned.

This mirrors the approach used by `LunrSearchProvider`.

---

## Bulk Indexing

`buildIndex()` processes pages in batches of 200 to avoid oversized bulk requests. For a 17,000-page
wiki this creates ~85 bulk API calls. The operation runs in the background — `SearchManager` already
calls it via `.catch()` and does not block startup.

---

## Comparison with LunrSearchProvider

| Aspect | LunrSearchProvider | ElasticsearchSearchProvider |
| --- | --- | --- |
| Storage | In-memory + `documents.json` | Elasticsearch cluster |
| Rebuild on save | Full in-memory rebuild | Single document upsert |
| Startup | Fast (load `documents.json`) | No rebuild needed |
| Scale | Comfortable to ~10k pages | Scales to millions |
| Multi-node | No | Yes |
| Aggregations | No | Yes (`terms` agg) |
| External dependency | None | Elasticsearch cluster |

---

## Auto-Tagging Integration (#507)

The `systemKeywords` field is the designated home for system-assigned tags generated by a future
`TaggingService` (Transformers.js zero-shot classification, per #507).

When #507 is implemented:

1. `TaggingService` enriches `metadata['system-keywords']` before `updatePageInIndex()` is called
2. The provider maps `metadata['system-keywords']` → `systemKeywords` with no interface changes
3. `getAllSystemKeywords()` aggregation is already available for faceted navigation

---

## Troubleshooting

__Provider not loading:__ Verify `ngdpbase.search.provider` is exactly `elasticsearchsearchprovider` (all lowercase).

__Index not found errors:__ The index is created automatically on first `buildIndex()`. If the
index was manually deleted, trigger a reindex from `/admin` or restart the server.

__`isHealthy()` returns false:__ Check that the ES URL is reachable and the cluster is healthy.
Run `GET <es-url>/_cluster/health` to verify.

__Wrong `indexname`:__ Ensure `ngdpbase.search.provider.elasticsearch.indexname` is `ngdpbase-pages`,
not `ngdpbase` (the old placeholder value in earlier config stubs).
