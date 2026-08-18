---
name: SearchManager
description: "Full-text page search with pluggable backends (Lunr in-process, Elasticsearch); also drives the asset-picker"
dateModified: '2026-05-14'
category: managers
code: src/managers/SearchManager.ts
---

# SearchManager

__Module:__ `src/managers/SearchManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Complete Guide:__ [SearchManager-Complete-Guide.md](SearchManager-Complete-Guide.md)

---

## Overview

SearchManager provides full-text search capabilities for ngdpbase through a pluggable provider system. It supports automatic indexing, advanced queries, and multiple search backends (Lunr.js, Elasticsearch, etc.).

## Key Features

- __Pluggable Providers__ - Support for multiple search engines (Lunr.js, Elasticsearch)
- __Full-Text Indexing__ - Automatic indexing of page content and metadata
- __Advanced Search__ - Field-specific queries, boolean operators, wildcards
- __Auto-Complete__ - Search suggestions and similar page recommendations
- __Automatic Index Updates__ - Keep index synchronized with page changes
- __Provider Fallback__ - Configurable default with automatic failover
- __WikiContext Integration__ - Permission-aware search results

## Quick Example

```javascript
const searchManager = engine.getManager('SearchManager');

// Simple search
const results = await searchManager.search('hello world');
console.log(`Found ${results.length} pages`);

// Search with options
const filtered = await searchManager.search('wiki', {
  limit: 10,
  fields: ['title', 'content'],
  boost: { title: 2 }
});

// Advanced search
const advanced = await searchManager.advancedSearch({
  title: 'documentation',
  content: 'manager',
  category: 'system',
  operator: 'AND'
});

// Get suggestions
const suggestions = await searchManager.getSuggestions('doc');
// Returns: ['documentation', 'docs', 'document']

// Find similar pages
const similar = await searchManager.suggestSimilarPages('HomePage', 5);
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `search(query, options)` | `Promise<Array>` | Simple full-text search |
| `advancedSearch(options)` | `Promise<Array>` | Field-specific advanced search |
| `searchWithContext(context, query, options)` | `Promise<Array>` | Permission-aware search |
| `advancedSearchWithContext(context, options)` | `Promise<Array>` | Advanced permission-aware search |
| `getSuggestions(partial)` | `Promise<string[]>` | Auto-complete suggestions |
| `suggestSimilarPages(pageName, limit)` | `Promise<Array>` | Find similar pages |
| `buildSearchIndex()` | `Promise<void>` | Build initial index |
| `rebuildIndex()` | `Promise<void>` | Rebuild entire index |
| `updatePageInIndex(pageName, pageData)` | `Promise<void>` | Update single page |
| `removePageFromIndex(pageName)` | `Promise<void>` | Remove page from index |

## Search Options

```javascript
await searchManager.search('query', {
  limit: 10,              // Maximum results
  offset: 0,              // Skip first N results
  fields: ['title', 'content', 'author'],  // Fields to search
  boost: {                // Field boosting
    title: 2,
    content: 1
  },
  fuzzy: true,            // Enable fuzzy matching
  prefix: true            // Enable prefix matching
});
```

## Advanced Search Options

```javascript
await searchManager.advancedSearch({
  title: 'documentation',     // Search in title
  content: 'manager',         // Search in content
  author: 'admin',            // Search in author
  category: 'system',         // Filter by category
  tags: ['important'],        // Filter by tags
  operator: 'AND',            // Boolean operator (AND/OR)
  dateFrom: '2025-01-01',     // Date range start
  dateTo: '2025-12-31',       // Date range end
  limit: 20                   // Maximum results
});
```

## Search Result Object

```javascript
{
  pageName: 'HomePage',
  title: 'Home Page',
  score: 0.95,              // Relevance score (0-1)
  excerpt: '...highlighted text...',  // Matching excerpt
  metadata: {
    author: 'admin',
    category: 'documentation',
    modified: '2025-12-21T10:00:00Z'
  },
  matches: {                // Field matches
    title: 1,
    content: 3
  }
}
```

## Configuration

```json
{
  "ngdpbase.search.enabled": true,
  "ngdpbase.search.provider.default": "lunrsearchprovider",
  "ngdpbase.search.provider": "lunrsearchprovider",
  "ngdpbase.search.provider.lunr.indexdir": "./data/search-index",
  "ngdpbase.search.provider.lunr.language": "en",
  "ngdpbase.search.provider.lunr.stopwords": true,
  "ngdpbase.search.provider.lunr.stemming": true
}
```

## Available Providers

| Provider | Status | Description |
| ---------- | -------- | ------------- |
| `LunrSearchProvider` | ✅ Production | In-memory full-text search |
| `ElasticsearchSearchProvider` | ✅ Production | Distributed search via Elasticsearch — opt in via `ngdpbase.search.provider=elasticsearchsearchprovider` |
| `SolrProvider` | 🔮 Planned | Distributed search via Apache Solr |
| `NullSearchProvider` | 🔮 Planned | No-op search (for testing) |

## Index Management

```javascript
// Build initial index (automatically called on initialize)
await searchManager.buildSearchIndex();

// Rebuild entire index
await searchManager.rebuildIndex();

// Update specific page
await searchManager.updatePageInIndex('HomePage', {
  content: 'New content',
  title: 'Updated Title',
  metadata: { author: 'admin' }
});

// Remove page from index
await searchManager.removePageFromIndex('OldPage');
```

## WikiContext Integration

```javascript
// Permission-aware search
const wikiContext = /* WikiContext instance */;
const results = await searchManager.searchWithContext(
  wikiContext,
  'secret',
  { limit: 10 }
);
// Only returns pages user has permission to view

// Advanced permission-aware search
const filtered = await searchManager.advancedSearchWithContext(
  wikiContext,
  {
    content: 'confidential',
    category: 'restricted'
  }
);
```

## Auto-Complete and Suggestions

```javascript
// Get search suggestions (for autocomplete)
const suggestions = await searchManager.getSuggestions('doc');
// Returns: ['documentation', 'docs', 'document']

// Find similar pages (for "See Also" sections)
const similar = await searchManager.suggestSimilarPages('HomePage', 5);
// Returns: [{pageName: 'Main', score: 0.85}, ...]
```

## Best Practices

1. __Update Index on Changes__: Call updatePageInIndex() when pages change
2. __Rebuild Periodically__: Schedule index rebuilds during low traffic
3. __Use WikiContext__: Always use permission-aware search in user-facing features
4. __Boost Important Fields__: Use field boosting for title/metadata
5. __Limit Results__: Always set reasonable limit to avoid performance issues
6. __Cache Results__: Consider caching search results for common queries

## Example: PageManager Integration

```javascript
class PageManager extends BaseManager {
  async savePage(name, content, metadata) {
    // Save to storage
    await this.provider.savePage(name, content, metadata);

    // Update search index
    const searchManager = this.engine.getManager('SearchManager');
    if (searchManager) {
      await searchManager.updatePageInIndex(name, {
        content,
        title: name,
        metadata
      });
    }
  }

  async deletePage(identifier) {
    const pageName = /* resolve identifier */;
    await this.provider.deletePage(identifier);

    // Remove from search index
    const searchManager = this.engine.getManager('SearchManager');
    if (searchManager) {
      await searchManager.removePageFromIndex(pageName);
    }
  }
}
```

## Disabling Search

```json
{
  "ngdpbase.search.enabled": false
}
```

When disabled, SearchManager skips provider loading and returns empty results.

## Related Managers

- [PageManager](PageManager.md) - Page content indexing
- [ConfigurationManager](ConfigurationManager.md) - Search configuration
- [CacheManager](CacheManager.md) - Search result caching
- [ACLManager](ACLManager.md) - Permission filtering

## Developer Documentation

For complete provider architecture, custom provider implementation, Lunr.js configuration, and troubleshooting:

- [SearchManager-Complete-Guide.md](SearchManager-Complete-Guide.md)
