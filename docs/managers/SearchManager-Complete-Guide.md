# SearchManager Complete Guide

__Module:__ `src/managers/SearchManager.js`
__Quick Reference:__ [SearchManager.md](SearchManager.md)
__Last Updated:__ 2025-12-20

---

## Overview

The `SearchManager` is responsible for full-text search indexing and querying in ngdpbase. It provides a centralized system for searching wiki content, suggesting similar pages, autocomplete functionality, and filtering by categories and keywords. The SearchManager uses a __provider pattern__ to support multiple search backends, making it flexible for different deployment scenarios from small wikis to large-scale enterprise deployments.

__Key Features:__

- __Pluggable Search Backends:__ Lunr.js, Elasticsearch, Algolia, and more
- __Full-Text Search:__ Search across page content, titles, categories, and metadata
- __Field Boosting:__ Configurable relevance scoring for different content fields
- __Autocomplete Suggestions:__ Real-time search suggestions as users type
- __Similar Pages:__ Content-based page recommendations
- __Advanced Filtering:__ Search by categories, keywords, tags, and custom criteria
- __Snippet Generation:__ Context-aware excerpts with highlighted search terms
- __Health Monitoring:__ Provider health checks with automatic fallback
- __Backup and Restore:__ Full index backup and recovery support

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                       SearchManager                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Public API                                          │  │
│  │  - search()                                          │  │
│  │  - advancedSearch()                                  │  │
│  │  - getSuggestions()                                  │  │
│  │  - suggestSimilarPages()                            │  │
│  │  - searchByCategory()                               │  │
│  │  - searchByUserKeywords()                           │  │
│  │  - buildSearchIndex()                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Provider Management                                 │  │
│  │  - Provider Loading & Normalization                  │  │
│  │  - Health Check & Failover                          │  │
│  │  - Configuration Integration                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ LunrSearchProvider│ │Elasticsearch     │ │AlgoliaSearch     │
│                  │ │Provider          │ │Provider          │
│ - In-Memory      │ │ - Distributed    │ │ - Cloud-Managed  │
│ - Stemming       │ │ - Scalable       │ │ - Instant Search │
│ - Field Boost    │ │ - Real-time      │ │ - Analytics      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Memory/Disk     │ │  Elasticsearch   │ │  Algolia Cloud   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Provider Pattern

The SearchManager implements a provider pattern that separates the search management logic from the search engine implementation:

1. __BaseSearchProvider:__ Abstract interface defining the contract for all search providers
2. __Concrete Providers:__ Implementations for specific search engines (Lunr.js, Elasticsearch, etc.)
3. __Provider Discovery:__ Dynamic loading based on configuration
4. __Health Monitoring:__ Automatic health checks during initialization
5. __Consistent API:__ All providers implement the same interface

## Configuration

### Core Search Settings

All configuration keys use __lowercase__ format per Issue #102 refactoring.

```json
{
  "_comment_search_storage": "Search indexing configuration (ALL LOWERCASE)",
  "ngdpbase.search.enabled": true,
  "ngdpbase.search.provider.default": "lunrsearchprovider",
  "ngdpbase.search.provider": "lunrsearchprovider",
  "ngdpbase.search.maxresults": 50,
  "ngdpbase.search.autocomplete.enabled": true,
  "ngdpbase.search.autocomplete.minlength": 2,
  "ngdpbase.search.suggestions.enabled": true,
  "ngdpbase.search.suggestions.maxitems": 10
}
```

### Configuration Reference

| Configuration Key | Type | Default | Description |
| ------------------ | ------ | --------- | ------------- |
| `ngdpbase.search.enabled` | boolean | `true` | Enable/disable search functionality |
| `ngdpbase.search.provider.default` | string | `"lunrsearchprovider"` | Fallback provider if primary fails |
| `ngdpbase.search.provider` | string | `"lunrsearchprovider"` | Active search provider |
| `ngdpbase.search.maxresults` | number | `50` | Maximum search results to return |
| `ngdpbase.search.autocomplete.enabled` | boolean | `true` | Enable autocomplete suggestions |
| `ngdpbase.search.autocomplete.minlength` | number | `2` | Minimum characters for autocomplete |
| `ngdpbase.search.suggestions.enabled` | boolean | `true` | Enable search suggestions |
| `ngdpbase.search.suggestions.maxitems` | number | `10` | Maximum suggestion items |

### Provider-Specific Configuration

#### LunrSearchProvider

```json
{
  "_comment_search_provider_lunr": "LunrSearchProvider settings",
  "ngdpbase.search.provider.lunr.indexdir": "./search-index",
  "ngdpbase.search.provider.lunr.stemming": true,
  "ngdpbase.search.provider.lunr.boost.title": 10,
  "ngdpbase.search.provider.lunr.boost.systemcategory": 8,
  "ngdpbase.search.provider.lunr.boost.userkeywords": 6,
  "ngdpbase.search.provider.lunr.boost.tags": 5,
  "ngdpbase.search.provider.lunr.boost.keywords": 4,
  "ngdpbase.search.provider.lunr.maxresults": 50,
  "ngdpbase.search.provider.lunr.snippetlength": 200
}
```

__LunrSearchProvider Configuration:__

| Key | Type | Default | Description |
| ----- | ------ | --------- | ------------- |
| `indexdir` | string | `"./search-index"` | Directory for persisted index files |
| `stemming` | boolean | `true` | Enable word stemming (running → run) |
| `boost.title` | number | `10` | Relevance boost for title matches |
| `boost.systemcategory` | number | `8` | Relevance boost for category matches |
| `boost.userkeywords` | number | `6` | Relevance boost for user keyword matches |
| `boost.tags` | number | `5` | Relevance boost for tag matches |
| `boost.keywords` | number | `4` | Relevance boost for keyword field |
| `maxresults` | number | `50` | Maximum results per search |
| `snippetlength` | number | `200` | Maximum snippet length in characters |

__Best For:__

- Small to medium wikis (<10,000 pages)
- Single-instance deployments
- Development and testing
- No external dependencies required

#### ElasticsearchSearchProvider

Activate by setting `ngdpbase.search.provider=elasticsearchsearchprovider`. Lunr remains the default.

```json
{
  "ngdpbase.search.provider": "elasticsearchsearchprovider",
  "ngdpbase.search.provider.elasticsearch.url": "http://localhost:9200",
  "ngdpbase.search.provider.elasticsearch.indexname": "ngdpbase-pages",
  "ngdpbase.search.provider.elasticsearch.connecttimeout": 5000,
  "ngdpbase.search.provider.elasticsearch.requesttimeout": 30000
}
```

Index `ngdpbase-pages` is created automatically on first `buildIndex()` call. Field mapping:

| ES field | Front-matter key | Purpose |
| --- | --- | --- |
| `systemCategory` | `system-category` | Storage routing; facet filter |
| `systemKeywords` | `system-keywords` | System-assigned classification |
| `userKeywords` | `user-keywords` | User-assigned from vocabulary |

See `docs/providers/ElasticsearchSearchProvider.md` for the full guide.

__Best For:__

- Large-scale wikis (10,000+ pages)
- Distributed / multi-node deployments
- Real-time incremental indexing
- Advanced aggregations and analytics

#### AlgoliaSearchProvider (Future)

__Best For:__

- Cloud-native deployments
- Instant search-as-you-type
- Managed service with analytics
- Global CDN distribution

## Usage

### Basic Search

```javascript
const searchManager = engine.getManager('SearchManager');

// Simple text search
const results = await searchManager.search('project documentation');

results.forEach(result => {
  console.log(`${result.title} (score: ${result.score})`);
  console.log(`Snippet: ${result.snippet}`);
  console.log(`Metadata:`, result.metadata);
});
```

__Output:__

```javascript
[
  {
    name: 'ProjectDocs',
    title: 'Project Documentation',
    score: 2.345,
    snippet: 'This is the main <mark>project</mark> <mark>documentation</mark>...',
    metadata: {
      wordCount: 1234,
      tags: 'documentation development',
      systemCategory: 'documentation',
      userKeywords: 'project guide',
      lastModified: '2025-10-12T10:00:00.000Z'
    }
  }
]
```

### Advanced Search

```javascript
// Multi-criteria search
const results = await searchManager.advancedSearch({
  query: 'authentication',
  categories: ['system', 'security'],
  userKeywords: ['user-management'],
  maxResults: 20
});
```

### Search with Options

```javascript
// Search with custom options
const results = await searchManager.search('wiki', {
  maxResults: 10,
  searchIn: ['title', 'content']
});
```

### Autocomplete Suggestions

```javascript
// Get autocomplete suggestions
const suggestions = await searchManager.getSuggestions('doc');
// Returns: ['documentation', 'docker', 'document', ...]
```

### Similar Pages

```javascript
// Find similar pages based on content
const similarPages = await searchManager.suggestSimilarPages('HomePage', 5);

similarPages.forEach(page => {
  console.log(`${page.title} (relevance: ${page.score})`);
});
```

### Search by Category

```javascript
// Find all pages in a category
const systemPages = await searchManager.searchByCategory('system');

// Search multiple categories
const pages = await searchManager.searchByCategories([
  'documentation',
  'developer'
]);
```

### Search by Keywords

```javascript
// Find pages with specific user keywords
const medicalPages = await searchManager.searchByUserKeywords('medicine');

// Search multiple keywords
const pages = await searchManager.searchByUserKeywordsList([
  'medicine',
  'healthcare'
]);
```

### Get Statistics

```javascript
// Get search index statistics
const stats = await searchManager.getStatistics();

console.log(`Total Documents: ${stats.totalDocuments}`);
console.log(`Index Size: ${stats.indexSize} bytes`);
console.log(`Avg Document Length: ${stats.averageDocumentLength} chars`);
console.log(`Categories: ${stats.totalCategories}`);
console.log(`User Keywords: ${stats.totalUserKeywords}`);
```

### Index Management

```javascript
// Rebuild entire search index
await searchManager.rebuildIndex();

// Add/update a page in the index
await searchManager.updatePageInIndex('NewPage', {
  content: 'Page content...',
  metadata: {
    title: 'New Page',
    'system-category': 'general',
    'user-keywords': ['example'],
    tags: ['new', 'test']
  }
});

// Remove a page from the index
await searchManager.removePageFromIndex('OldPage');

// Get document count
const count = await searchManager.getDocumentCount();
console.log(`Indexed pages: ${count}`);
```

### Backup and Restore

```javascript
// Backup search index
const backupData = await searchManager.backup();
// Save backupData to file or database

// Restore from backup
await searchManager.restore(backupData);
```

## API Reference

### Core Methods

#### `initialize(config)`

Initializes the SearchManager with the configured search provider.

__Parameters:__

- `config` (Object) - Configuration options (usually empty, uses ConfigurationManager)

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.initialize();
```

#### `buildSearchIndex()`

Builds or rebuilds the entire search index from all pages.

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.buildSearchIndex();
// Logs: 🔍 Search index built with 83 documents
```

#### `search(query, options)`

Searches for pages matching the query.

__Parameters:__

- `query` (string) - Search query string
- `options` (Object) - Optional search options
  - `maxResults` (number) - Maximum results to return
  - `searchIn` (`Array<string>`) - Fields to search in

__Returns:__ `Promise<Array<SearchResult>>`

__SearchResult Structure:__

```javascript
{
  name: string,              // Page name/ID
  title: string,             // Page title
  score: number,             // Relevance score (higher = more relevant)
  snippet: string,           // Content excerpt with <mark> tags
  metadata: {
    wordCount: number,       // Total word count
    tags: string,            // Space-separated tags
    systemCategory: string,  // System category
    userKeywords: string,    // User-defined keywords
    lastModified: string     // ISO 8601 timestamp
  }
}
```

__Example:__

```javascript
const results = await searchManager.search('authentication security', {
  maxResults: 10
});
```

#### `advancedSearch(options)`

Performs advanced multi-criteria search.

__Parameters:__

- `options` (Object)
  - `query` (string) - Text query (optional)
  - `categories` (`Array<string>`) - Filter by categories
  - `userKeywords` (`Array<string>`) - Filter by user keywords
  - `searchIn` (`Array<string>`) - Fields to search in
  - `maxResults` (number) - Maximum results

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const results = await searchManager.advancedSearch({
  query: 'configuration',
  categories: ['system', 'documentation'],
  userKeywords: ['setup', 'installation'],
  maxResults: 20
});
```

#### `getSuggestions(partial)`

Gets autocomplete suggestions for a partial search term.

__Parameters:__

- `partial` (string) - Partial search term (minimum 2 characters)

__Returns:__ `Promise<Array<string>>`

__Example:__

```javascript
const suggestions = await searchManager.getSuggestions('doc');
// Returns: ['documentation', 'docker', 'document', 'docs']
```

#### `suggestSimilarPages(pageName, limit)`

Finds similar pages based on content analysis.

__Parameters:__

- `pageName` (string) - Source page name
- `limit` (number) - Maximum suggestions (default: 5)

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const similar = await searchManager.suggestSimilarPages('APIDocumentation', 5);
```

#### `searchByCategory(category)`

Searches for pages in a specific category.

__Parameters:__

- `category` (string) - Category name to search

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const systemPages = await searchManager.searchByCategory('system');
```

#### `searchByCategories(categories)`

Searches for pages in multiple categories.

__Parameters:__

- `categories` (`Array<string>`) - Array of category names

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const pages = await searchManager.searchByCategories([
  'documentation',
  'developer',
  'user'
]);
```

#### `searchByUserKeywords(keyword)`

Searches for pages with a specific user keyword.

__Parameters:__

- `keyword` (string) - User keyword to search

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const medicalPages = await searchManager.searchByUserKeywords('medicine');
```

#### `searchByUserKeywordsList(keywords)`

Searches for pages with multiple user keywords.

__Parameters:__

- `keywords` (`Array<string>`) - Array of user keywords

__Returns:__ `Promise<Array<SearchResult>>`

__Example:__

```javascript
const pages = await searchManager.searchByUserKeywordsList([
  'medicine',
  'healthcare',
  'treatment'
]);
```

#### `getAllCategories()`

Gets all unique categories from indexed documents.

__Returns:__ `Promise<Array<string>>`

__Example:__

```javascript
const categories = await searchManager.getAllCategories();
// Returns: ['documentation', 'general', 'system', 'developer', ...]
```

#### `getAllUserKeywords()`

Gets all unique user keywords from indexed documents.

__Returns:__ `Promise<Array<string>>`

__Example:__

```javascript
const keywords = await searchManager.getAllUserKeywords();
// Returns: ['medicine', 'geology', 'draft', 'published', ...]
```

#### `getStatistics()`

Gets comprehensive search index statistics.

__Returns:__ `Promise<Object>`

__Statistics Structure:__

```javascript
{
  totalDocuments: number,          // Total indexed pages
  indexSize: number,               // Index size in bytes
  averageDocumentLength: number,   // Average page length
  totalCategories: number,         // Number of unique categories
  totalUserKeywords: number,       // Number of unique keywords
  providerName: string,            // Active provider name
  providerVersion: string          // Provider version
}
```

__Example:__

```javascript
const stats = await searchManager.getStatistics();
console.log(`Indexed ${stats.totalDocuments} pages`);
```

#### `getDocumentCount()`

Gets the total number of indexed documents.

__Returns:__ `Promise<number>`

__Example:__

```javascript
const count = await searchManager.getDocumentCount();
console.log(`${count} pages indexed`);
```

### Index Management Methods

#### `rebuildIndex()`

Alias for `buildSearchIndex()`. Rebuilds the entire search index.

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.rebuildIndex();
```

#### `updatePageInIndex(pageName, pageData)`

Adds or updates a single page in the search index.

__Parameters:__

- `pageName` (string) - Page name/ID
- `pageData` (Object) - Page data
  - `content` (string) - Page content
  - `metadata` (Object) - Page metadata

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.updatePageInIndex('NewPage', {
  content: 'This is the page content...',
  metadata: {
    title: 'New Page',
    'system-category': 'documentation',
    'user-keywords': ['example', 'demo'],
    tags: ['new', 'test']
  }
});
```

#### `removePageFromIndex(pageName)`

Removes a page from the search index.

__Parameters:__

- `pageName` (string) - Page name to remove

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.removePageFromIndex('DeletedPage');
```

#### `addToIndex(page)`

Adds a page object to the index.

__Parameters:__

- `page` (Object) - Page object with `name`, `content`, and `metadata`

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.addToIndex({
  name: 'TestPage',
  content: 'Test content...',
  metadata: {
    title: 'Test Page',
    'system-category': 'test'
  }
});
```

#### `removeFromIndex(pageName)`

Alias for `removePageFromIndex()`.

__Parameters:__

- `pageName` (string) - Page name to remove

__Returns:__ `Promise<void>`

### Backup and Recovery Methods

#### `backup()`

Creates a backup of the search index and configuration.

__Returns:__ `Promise<Object>` - Backup data object

__Example:__

```javascript
const backup = await searchManager.backup();
// Save to file
const fs = require('fs').promises;
await fs.writeFile(
  './backups/search-index-backup.json',
  JSON.stringify(backup, null, 2)
);
```

#### `restore(backupData)`

Restores the search index from backup data.

__Parameters:__

- `backupData` (Object) - Backup data from `backup()`

__Returns:__ `Promise<void>`

__Example:__

```javascript
const fs = require('fs').promises;
const backup = JSON.parse(
  await fs.readFile('./backups/search-index-backup.json', 'utf8')
);
await searchManager.restore(backup);
```

#### `shutdown()`

Gracefully shuts down the SearchManager and closes the provider.

__Returns:__ `Promise<void>`

__Example:__

```javascript
await searchManager.shutdown();
// Logs: [LunrSearchProvider] Closed successfully
// Logs: [SearchManager] Shut down successfully
```

## Search Relevance and Boosting

### Field Boost Configuration

The LunrSearchProvider uses field boosting to improve search relevance:

| Field | Default Boost | Description |
| ------- | -------------- | ------------- |
| `title` | 10 | Page title (highest priority) |
| `systemCategory` | 8 | System category field |
| `userKeywords` | 6 | User-defined keywords |
| `tags` | 5 | Page tags |
| `keywords` | 4 | Combined keywords field |
| `content` | 1 | Page content (baseline) |

### Boost Tuning Example

```json
{
  "ngdpbase.search.provider.lunr.boost.title": 15,
  "ngdpbase.search.provider.lunr.boost.systemcategory": 10,
  "ngdpbase.search.provider.lunr.boost.userkeywords": 8,
  "ngdpbase.search.provider.lunr.boost.tags": 6,
  "ngdpbase.search.provider.lunr.boost.keywords": 5
}
```

### Relevance Calculation

The relevance score is calculated using:

1. __Term Frequency (TF):__ How often the search term appears
2. __Inverse Document Frequency (IDF):__ How unique the term is across all documents
3. __Field Boosting:__ Multiplier based on which field contains the match
4. __Length Normalization:__ Adjusts for document length

__Example:__

```javascript
// Searching for "authentication"
// Document A: "authentication" in title → score: 10.0 × TF-IDF
// Document B: "authentication" in content → score: 1.0 × TF-IDF
// Result: Document A ranks higher
```

## Snippet Generation

The SearchManager generates context-aware snippets with highlighted search terms:

### Snippet Features

1. __Best Position Selection:__ Finds the text window with the most search term matches
2. __Configurable Length:__ Default 200 characters (configurable)
3. __Term Highlighting:__ Wraps matches in `<mark>` tags
4. __Ellipsis Truncation:__ Adds `...` for long content

### Example

__Query:__ `"wiki documentation"`

__Snippet Output:__

```html
This is the main <mark>wiki</mark> <mark>documentation</mark> page.
It contains information about how to use the <mark>wiki</mark> system
including creating pages, editing content...
```

### Configuration

```json
{
  "ngdpbase.search.provider.lunr.snippetlength": 200
}
```

## Provider Information

### LunrSearchProvider

__Current Implementation:__ ✅ __Available__

```javascript
const info = searchManager.provider.getProviderInfo();
console.log(info);
```

__Output:__

```javascript
{
  name: 'LunrSearchProvider',
  version: '1.0.0',
  description: 'Full-text search using Lunr.js',
  features: [
    'full-text',
    'stemming',
    'field-boosting',
    'snippets',
    'suggestions'
  ]
}
```

__Capabilities:__

- ✅ Full-text search with stemming
- ✅ Field-based relevance boosting
- ✅ Snippet generation with highlighting
- ✅ Autocomplete suggestions
- ✅ Similar page recommendations
- ✅ Category and keyword filtering
- ✅ Multi-criteria advanced search
- ✅ Backup and restore
- ✅ In-memory indexing
- ⚠️ Limited to ~10,000 pages

__Use Cases:__

- Small to medium wikis
- Single-instance deployments
- Development and testing
- Embedded documentation systems

### ElasticsearchProvider (Future)

__Status:__ 🔮 __Planned__

__Capabilities:__

- Distributed full-text search
- Real-time indexing
- Fuzzy matching and typo tolerance
- Aggregations and faceting
- Scalable to millions of pages
- Advanced analytics
- Multi-language support
- Geographic search

__Use Cases:__

- Large-scale enterprise wikis
- Multi-tenant deployments
- Knowledge bases with >10,000 pages
- Real-time search requirements

### AlgoliaSearchProvider (Future)

__Status:__ 🔮 __Planned__

__Capabilities:__

- Instant search-as-you-type
- Managed cloud service
- Global CDN distribution
- Built-in analytics
- Personalization
- A/B testing
- Typo tolerance
- Query suggestions

__Use Cases:__

- Cloud-native deployments
- Public-facing wikis
- SaaS applications
- Global distributed teams

## Events and Integration

### PageManager Integration

SearchManager automatically integrates with PageManager to keep the index up-to-date:

```javascript
// In PageManager
await pageManager.savePage(pageName, content, metadata);
// SearchManager automatically updates the index

await pageManager.deletePage(pageName);
// SearchManager automatically removes from index
```

### Manual Integration

For custom integrations:

```javascript
// After creating/updating a page
await searchManager.updatePageInIndex(pageName, pageData);

// After deleting a page
await searchManager.removePageFromIndex(pageName);

// For bulk changes
await searchManager.rebuildIndex();
```

## Performance Considerations

### LunrSearchProvider Performance

__Index Building:__

- Time: ~0.1-0.5 seconds per 100 pages
- Memory: ~5-10 MB per 1,000 pages
- Recommended: <10,000 pages

__Search Performance:__

- Time: <10ms for most queries
- Memory: Constant (index in memory)
- Scales linearly with index size

### Optimization Tips

1. __Index Building:__

   ```javascript
   // Build index during startup or off-peak hours
   await searchManager.buildSearchIndex();
   ```

2. __Incremental Updates:__

   ```javascript
   // Update individual pages instead of full rebuild
   await searchManager.updatePageInIndex(pageName, pageData);
   ```

3. __Result Limiting:__

   ```javascript
   // Limit results for faster response
   const results = await searchManager.search(query, { maxResults: 10 });
   ```

4. __Field Boosting:__

   ```json
   // Fine-tune boost values for your content
   {
     "ngdpbase.search.provider.lunr.boost.title": 15,
     "ngdpbase.search.provider.lunr.boost.content": 1
   }
   ```

## Troubleshooting

### Common Issues

#### 1. Search Returns No Results

__Symptoms:__

```javascript
const results = await searchManager.search('test');
console.log(results); // []
```

__Solutions:__

1. Check if index is built:

   ```javascript
   const count = await searchManager.getDocumentCount();
   console.log(`Indexed pages: ${count}`);
   ```

2. Rebuild index:

   ```javascript
   await searchManager.rebuildIndex();
   ```

3. Verify pages exist:

   ```javascript
   const pageManager = engine.getManager('PageManager');
   const pages = await pageManager.getAllPages();
   console.log(`Total pages: ${pages.length}`);
   ```

#### 2. Provider Load Failure

__Symptoms:__

```
Error: Failed to load search provider: Cannot find module '../providers/LunrSearchProvider'
```

__Solutions:__

1. Verify provider file exists:

   ```bash
   ls -la src/providers/LunrSearchProvider.js
   ```

2. Check configuration:

   ```json
   {
     "ngdpbase.search.provider": "lunrsearchprovider"
   }
   ```

3. Check provider normalization:

   ```javascript
   // Should convert: lunrsearchprovider → LunrSearchProvider
   ```

#### 3. Poor Search Relevance

__Solutions:__

1. Adjust field boost values
2. Use more specific search terms
3. Enable stemming
4. Check document content quality

#### 4. Slow Index Building

__Solutions:__

1. Reduce page count
2. Build index asynchronously
3. Consider Elasticsearch for large wikis
4. Optimize page content size

### Debug Mode

Enable debug logging:

```javascript
const logger = require('./utils/logger');
logger.level = 'debug';

await searchManager.buildSearchIndex();
// Shows detailed indexing progress
```

### Health Check

```javascript
const isHealthy = await searchManager.provider.isHealthy();
console.log(`Provider healthy: ${isHealthy}`);
```

## Best Practices

### 1. Index Management

✅ __Do:__

- Build index during application startup
- Use incremental updates for single page changes
- Schedule periodic full rebuilds (e.g., daily)
- Monitor index size and performance

❌ __Don't:__

- Rebuild index on every page update
- Build index synchronously in request handlers
- Ignore index health status

### 2. Search Queries

✅ __Do:__

- Use specific search terms
- Limit results with `maxResults`
- Use advanced search for complex queries
- Cache frequently searched queries

❌ __Don't:__

- Search with single-character terms
- Return unlimited results
- Use wildcards excessively

### 3. Configuration

✅ __Do:__

- Tune boost values for your content
- Configure appropriate snippet length
- Set reasonable result limits
- Use provider-specific optimizations

❌ __Don't:__

- Use default values without testing
- Set extremely high boost values
- Return entire page content

### 4. Performance

✅ __Do:__

- Monitor search performance metrics
- Use appropriate provider for scale
- Implement result caching
- Paginate large result sets

❌ __Don't:__

- Block on index building
- Load entire index for every search
- Ignore memory usage

## Migration Guide

### From Direct Lunr.js to SearchManager

__Before:__

```javascript
const lunr = require('lunr');
const idx = lunr(function () {
  this.ref('id');
  this.field('title');
  this.field('content');
  // ...
});
const results = idx.search('query');
```

__After:__

```javascript
const searchManager = engine.getManager('SearchManager');
await searchManager.initialize();
const results = await searchManager.search('query');
```

### Configuration Migration

__Before:__

```json
{
  "ngdpbase.searchProvider": "LunrSearchProvider"
}
```

__After:__

```json
{
  "ngdpbase.search.enabled": true,
  "ngdpbase.search.provider": "lunrsearchprovider",
  "ngdpbase.search.provider.lunr.stemming": true
}
```

## Related Documentation

- [BaseSearchProvider](../../src/providers/BaseSearchProvider.js) - Provider interface
- [LunrSearchProvider](../../src/providers/LunrSearchProvider.js) - Lunr.js implementation
- [PageManager](./PageManager.md) - Page content management
- [CacheManager](./CacheManager.md) - Similar provider pattern
- [AuditManager](./AuditManager.md) - Similar provider pattern
- [GitHub Issue #102](https://github.com/jwilleke/ngdpbase/issues/102) - Configuration reorganization

## Version History

### v1.0.0 (2025-10-12)

- ✅ Initial implementation with provider pattern
- ✅ LunrSearchProvider with full-text search
- ✅ Field boosting and relevance tuning
- ✅ Snippet generation with highlighting
- ✅ Autocomplete suggestions
- ✅ Similar page recommendations
- ✅ Category and keyword filtering
- ✅ Advanced multi-criteria search
- ✅ Backup and restore support
- ✅ Health monitoring
- ✅ Configuration following Issue #102 pattern

---

__Maintained By:__ Development Team
__Status:__ Active Development
__Related Issue:__ #102
