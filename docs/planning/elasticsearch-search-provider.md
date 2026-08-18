# Plan: ElasticsearchSearchProvider — #189 / #504

> Related issues: [#189](../../issues/189) (Lunr alternatives), [#504](../../issues/504) (ES search integration), [#505](../../issues/505) ("NAS File Search" → "External Asset Search" rename), [#507](../../issues/507) (auto-tagging, forward-compatibility)
>
> Remove this file when implementation is complete.

## Context

Lunr is the current (and only) search provider. At 17,280 documents and 44 MB of `documents.json`
in jimstest it is at the edge of comfortable operation:

- Rebuilds the entire in-memory index on every single page edit
- Uses a "fast path" that loads the persisted `documents.json` on startup, which caused addon pages
  to silently not appear in search (required the fix in #433)
- Not suitable for multi-node deployment or wikis with hundreds of thousands of pages

An Elasticsearch instance is already running at `http://192.168.68.71:9200` for the sist2 NAS
asset addon. The `SearchManager` was designed for pluggable providers from the start — switching
is a single config key. Config stubs for an ES search provider already exist in SearchManager
comments. The `@elastic/elasticsearch` ^8.15.0 client is already in the addon; just needs to
move to the root package.

This plan implements `ElasticsearchSearchProvider` as an optional core search provider.
Lunr remains the default; operators opt in via config.

---

## Architecture

### Where it lives

`src/providers/ElasticsearchSearchProvider.ts` — alongside `LunrSearchProvider.ts`.

SearchManager loads it automatically when:

```json
"ngdpbase.search.provider": "elasticsearchsearchprovider"
```

### ES index

- Index name: `ngdpbase-pages` (distinct from the sist2 `ngdpbase.addons.elasticsearch.es-index`)
- Created on first `buildIndex()` call; mapping defined with explicit field types

__Mapping:__

```json
{
  "mappings": {
    "properties": {
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

__Field → metadata source mapping:__

| ES field | Front-matter key | Purpose |
| --- | --- | --- |
| `systemCategory` | `system-category` | Storage routing; where the page lives |
| `systemKeywords` | `system-keywords` | System-assigned classification — future home of #507 auto-tags |
| `userKeywords` | `user-keywords` | User-assigned from controlled vocabulary |

__Comparison with current Lunr internal fields:__

| Lunr field | ES field | Change | Reason |
| --- | --- | --- | --- |
| `systemCategory` | `systemCategory` | Same | Active, maps from `system-category` |
| `userKeywords` | `userKeywords` | Same | Active, maps from `user-keywords` |
| `tags` | *(dropped)* | Removed | `metadata['tags']` is always empty — no pages have `tags:` in front matter |
| *(absent)* | `systemKeywords` | Added | Maps from `system-keywords`; config vocab exists, code not yet wired; pre-wires for #507 auto-tagging |

`tags` (legacy Lunr field) is intentionally omitted — no pages have `tags:` in front matter;
`metadata['tags']` always resolves to an empty array in practice.

---

## Config Keys

Add to `app-default-config.json`:

```json
"ngdpbase.search.provider.elasticsearch.url":            "http://localhost:9200",
"ngdpbase.search.provider.elasticsearch.indexname":      "ngdpbase-pages",
"ngdpbase.search.provider.elasticsearch.connecttimeout": 5000,
"ngdpbase.search.provider.elasticsearch.requesttimeout": 30000
```

jimstest `app-custom-config.json` additions:

```json
"ngdpbase.search.provider":                              "elasticsearchsearchprovider",
"ngdpbase.search.provider.elasticsearch.url":            "http://192.168.68.71:9200"
```

---

## `src/providers/ElasticsearchSearchProvider.ts`

Extends `BaseSearchProvider` (same base as `LunrSearchProvider`).

### Key method implementations

| Method | ES operation |
| --- | --- |
| `initialize()` | Create `Client`, verify index exists (create with mapping if not) |
| `buildIndex()` | Read all pages via `pageManager.getAllPages()` + `getPage()`, bulk index in 200-doc batches |
| `search(query, options)` | `multi_match` on title/content/userKeywords, `bool.filter` for private page exclusion |
| `advancedSearch(criteria)` | `bool` query: `must` (text), `filter` (category, keywords, date range, author), `must_not` (private exclusion) |
| `updatePageInIndex(name, data)` | `client.index({ index, id: name, document: ... })` |
| `removePageFromIndex(name)` | `client.delete({ index, id: name })` |
| `searchByCategory(category)` | `term: { systemCategory: category }` |
| `searchByUserKeywords(kw)` | `term: { userKeywords: kw }` |
| `getAllCategories()` | `terms` aggregation on `systemCategory`, size 100 |
| `getAllUserKeywords()` | `terms` aggregation on `userKeywords`, size 500 |
| `getAllSystemKeywords()` | `terms` aggregation on `systemKeywords`, size 500 |
| `getSuggestions(partial)` | `match_phrase_prefix` on `title.keyword` |
| `suggestSimilarPages(name, limit)` | `more_like_this` on title+content |
| `getStatistics()` | `count` API + `indices.stats` |
| `getDocumentCount()` | `count` API |
| `isHealthy()` | `ping()` |
| `close()` | `client.close()` |
| `backup()` | Scroll all docs, return as JSON |
| `restore(data)` | Bulk index from backup payload |

### Private page access control

`SearchResult` filtering mirrors the existing `LunrSearchProvider` approach:

- Documents store `isPrivate: boolean` and `audience: string[]`
- At query time, inject a `bool.filter` that either:
  - Allows if `isPrivate: false`, OR
  - Allows if `audience` contains any of the current user's roles

SearchManager passes `userRoles` in `AdvancedSearchOptions` — same pattern already used by Lunr.

---

## Root package.json

Add to `dependencies`:

```json
"@elastic/elasticsearch": "^8.15.0"
```

(Currently only in `addons/elasticsearch/package.json`)

---

## Tests

`src/providers/__tests__/ElasticsearchSearchProvider.test.js`

Mock `@elastic/elasticsearch` Client (same mock pattern as `addons/elasticsearch/__tests__/`).

Tests:

- `initialize()` creates index if not exists, skips if exists
- `buildIndex()` bulk-indexes all pages from PageManager
- `search()` with text → correct `multi_match` body
- `search()` with empty query → `match_all`
- `advancedSearch()` with category filter → `term` in filter clause
- `advancedSearch()` with date range → `range` on `lastModified`
- `advancedSearch()` with private pages → `isPrivate: false` filter OR audience match
- `updatePageInIndex()` → `client.index()` called with correct document shape; `systemKeywords` populated from `metadata['system-keywords']`, `userKeywords` from `metadata['user-keywords']`; `tags` field absent
- `removePageFromIndex()` → `client.delete()` called
- `searchByCategory()` → correct term query
- `getAllCategories()` → extracts from `aggregations.categories.buckets`
- `getAllUserKeywords()` → extracts from `aggregations.userKeywords.buckets`
- `getAllSystemKeywords()` → extracts from `aggregations.systemKeywords.buckets`
- `getDocumentCount()` → returns `count.count`
- `isHealthy()` returns true on ping success / false on error
- `buildIndex()` batches in chunks of 200

---

## Critical Files

### Code

| File | Action |
| --- | --- |
| `src/providers/ElasticsearchSearchProvider.ts` | __Create__ — new provider |
| `src/providers/__tests__/ElasticsearchSearchProvider.test.js` | __Create__ — tests |
| `package.json` | __Edit__ — add `@elastic/elasticsearch ^8.15.0` to dependencies |
| `config/app-default-config.json` | __Edit__ — add ES search provider config keys |
| `/Volumes/hd2/jimstest-wiki/data/config/app-custom-config.json` | __Edit__ — activate provider + set ES URL |

### Developer Docs — Update Existing

| File | What to update |
| --- | --- |
| `docs/managers/SearchManager.md` | Change `ElasticsearchProvider` status from `🔮 Planned` to `✅ Production` (line ~141) |
| `docs/managers/SearchManager-Complete-Guide.md` | Replace "Future" placeholder (line ~149, ~868) with real config keys and field mapping; update `indexname` default from `"ngdpbase"` to `"ngdpbase-pages"` |
| `docs/design/SEARCH_PROVIDER_IMPLEMENTATION.md` | Update status from future to implemented; fix `indexname` default from `"ngdpbase"` to `"ngdpbase-pages"` (line ~142) |

### Developer Docs — New Files

| File | Content |
| --- | --- |
| `docs/providers/ElasticsearchSearchProvider.md` | Quick reference — overview, config keys, field mapping table, link to complete guide (follow pattern of `FileSystemProvider.md`) |
| `docs/providers/ElasticsearchSearchProvider-Complete-Guide.md` | Full guide — architecture, all methods, index mapping, private page access control, bulk indexing, backup/restore, Lunr comparison, setup instructions (follow pattern of `FileSystemProvider-Complete-Guide.md`) |

### Required Pages (Wiki) — Update Existing

| File | Slug | What to update |
| --- | --- | --- |
| `required-pages/fe7a378d-dfa5-4e37-9891-637568ebe0b4.md` | `search-documentation` | Add note that Elasticsearch provider is available for large wikis; link to admin setup |
| `required-pages/67b76b5c-81f0-4a00-9bb1-6a816d26e284.md` | `reindex` | Mention ES reindex triggers `buildIndex()` which re-bulk-indexes all pages |
| `required-pages/928a1050-3542-4140-9cd4-515bac154c84.md` | `configuration-properties` | Add the four new `ngdpbase.search.provider.elasticsearch.*` keys |
| `required-pages/e67d5e25-76d4-43fb-bce0-6f7675654f17.md` | `performance-optimization` | Add guidance: switch to ES provider for wikis >10k pages |

---

## #505 — Rename "NAS File Search" → "External Asset Search"

The elasticsearch addon seeds two user-facing pages with NAS-specific names. These should be
generic since the asset provider could back any Elasticsearch-indexed content, not just NAS files.

### Addon code changes

| File | Change |
| --- | --- |
| `addons/elasticsearch/src/Sist2AssetProvider.ts:45` | `displayName = 'sist2 NAS Index'` → `'External Asset Index'` |
| `addons/elasticsearch/index.ts:38` | `description: 'sist2/Elasticsearch NAS asset provider'` → `'Elasticsearch external asset provider (sist2 NAS index)'` |
| `addons/elasticsearch/index.ts:7` (JSDoc) | Update module comment to de-emphasise NAS; describe as generic Elasticsearch asset provider |

### Addon seeded pages

| File | Current title | New title |
| --- | --- | --- |
| `addons/elasticsearch/pages/134fdcb0-95d9-4856-b25f-837793cc4e0a.md` | `NAS File Search` | `External Asset Search` |
| `addons/elasticsearch/pages/4da88ee4-23c6-4c1c-82eb-1f20d82e1dcc.md` | `NAS File Search Admin` | `External Asset Search Admin` |

In each page, update the front-matter `title:`, the `# H1` heading, and any inline text that
says "NAS File Search" or "NAS files" to generic equivalents ("external assets", "indexed files").
Line `Use the **Source** filter to select **sist2 NAS Index**` in `134fdcb0` should become
`Use the **Source** filter to select **External Asset Index**`.

### Note on addon naming

The addon directory remains `addons/elasticsearch/` and the addon `name` key stays `'elasticsearch'`
— renaming the directory is out of scope and would break existing config keys.

The underlying content is intentionally generic: the provider indexes whatever sist2 (or any
compatible crawler) has sent to Elasticsearch — NAS, S3, Azure Blob, local disk, etc. The user-
facing label "External Asset Search" / "External Asset Index" captures this without assuming
anything about the storage backend.

---

## Verification

1. `npm install` — installs `@elastic/elasticsearch` at root
2. `npx tsc -p tsconfig.json --noEmit` — compiles clean
3. `npm test -- --testPathPatterns="ElasticsearchSearchProvider"` — all tests pass
4. `./server.sh restart` — logs show `🔍 Loading search provider: elasticsearchsearchprovider`
5. `GET /search?q=calendar` — returns wiki pages from ES
6. `GET /search?q=&searchIn=all&category=addon` — still returns addon pages
7. `GET /api/admin/search/stats` (if exists) — shows ES document count
8. Private page: verify not returned for user without access

---

## Relationship to #507 (Content-Based Auto-Tagging)

Issue 507 established the tagging pipeline: sist2 tags NAS *files* (Python/Hugging Face on Linux),
while ngdpbase would use Transformers.js to auto-tag *wiki-page content*.

This provider is designed to accommodate that future `TaggingService` without interface changes:

- The mapping includes a `systemKeywords: keyword[]` field — the correct home for auto-assigned tags
- `system-category` (storage routing) and `system-keywords` (classification) are orthogonal concerns, both reflected in the ES mapping
- `updatePageInIndex()` accepts a plain `data` object — a TaggingService can write auto-generated tags into `metadata['system-keywords']` before the caller invokes this method; the provider maps it to `systemKeywords` with no interface changes needed
- No Transformers.js dependency is introduced here; auto-tagging is out of scope for this issue
- When #507 is implemented, `systemKeywords` aggregation is already available via `getAllSystemKeywords()`

---

## Notes

- The existing `addons/elasticsearch` addon uses `@elastic/elasticsearch` client from its own
  `node_modules`. Moving the dep to the root allows the main project to share the client.
  The addon's own `package.json` dependency can remain for standalone builds.
- Lunr remains the default. No existing deployments change behaviour without opt-in config.
- The `ngdpbase-pages` index is completely separate from the sist2 `ngdpbase.addons.elasticsearch.es-index`.
- `buildIndex()` will be slow the first time (17k docs) but is not blocking — SearchManager already
  runs it in background via `.catch()`.
