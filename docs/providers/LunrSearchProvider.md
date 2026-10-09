---
name: LunrSearchProvider
description: In-memory full-text search index (MiniSearch, Lunr query syntax and stemming) — default backend for SearchManager
dateModified: '2026-10-09'
category: providers
code: src/providers/LunrSearchProvider.ts
---

# LunrSearchProvider

Default search backend. An in-memory full-text index over each page's title, content, system category, knowledge role, user keywords, tags, keywords and URL words, with per-document fields for the private-page filter at search time.

## Engine (#1736)

- The index is [MiniSearch](https://github.com/lucaong/minisearch). A save adds, replaces or removes one document (`updatePageInIndex`, `removePageFromIndex`); the index is built in full only at start-up and after a restore. Until #1736 the engine was Lunr, whose index cannot change once built: every save rebuilt it, about 3 s on 18,000 pages, synchronously, freezing the site.
- The name and the `ngdpbase.search.provider.lunr.*` keys are kept, so existing configuration keeps working.
- Words are processed as before: lower-cased, English stop words dropped, and stemmed with Lunr's stemmer (`lunr` stays a dependency for that alone), so "backups" finds "backup". `ngdpbase.search.provider.lunr.stemming: false` now really turns stemming off; under Lunr the setting was read and ignored.
- Lunr's query syntax still works, translated by `lunrQueryToMiniSearch.ts`: `word` (any), `+word` (required), `-word` (excluded), `field:word`, `word*` (prefix), `word~1` (fuzzy). An unknown `field:` prefix is plain text, so a typed URL is a search, not an error. `^boost` is accepted and ignored.
- `documents.json` (the stored documents the index is built from) is written 2 s after the last change, by the periodic flush, and on close; not on every save. It is no longer pretty-printed.

## Configuration

- `ngdpbase.search.provider.lunr.indexdir` — where `documents.json` lives
- `ngdpbase.search.provider.lunr.stemming` — English stemming on (default) or off
- `ngdpbase.search.provider.lunr.boost.*` — field boosts: `title` 10, `systemcategory` 8, `knowledgerole` 8, `userkeywords` 6, `tags` 5, `keywords` 4, `urltokens` 3 (content is 1)
- `ngdpbase.search.provider.lunr.maxresults`, `.snippetlength`, `.flushinterval`

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
