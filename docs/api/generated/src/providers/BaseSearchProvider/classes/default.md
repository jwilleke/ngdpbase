[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BaseSearchProvider](../README.md) / default

# Abstract Class: default

Defined in: [src/providers/BaseSearchProvider.ts:138](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L138)

BaseSearchProvider - Abstract base class for search providers

All search providers must extend this class and implement its abstract methods.
Provides a consistent interface for different search backend implementations.

## Extended by

- [`default`](../../LunrSearchProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseSearchProvider`

Defined in: [src/providers/BaseSearchProvider.ts:150](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L150)

Creates a new BaseSearchProvider instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Reference to the WikiEngine instance

#### Returns

`BaseSearchProvider`

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseSearchProvider.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L140)

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/providers/BaseSearchProvider.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L143)

Whether provider has been initialized

## Methods

### advancedSearch()

> `abstract` __advancedSearch__(`criteria?`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: [src/providers/BaseSearchProvider.ts:217](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L217)

Advanced search with multiple criteria

Performs a more complex search using multiple criteria including
query, categories, keywords, author, date range, etc.

#### Parameters

##### criteria?

[`SearchCriteria`](../interfaces/SearchCriteria.md)

Search criteria object

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise resolving to array of search results

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: [src/providers/BaseSearchProvider.ts:364](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L364)

Backup search index and configuration (optional)

Creates a backup of the search index and configuration data.
Default implementation provides basic metadata.
Subclasses should override to include actual index data.

#### Returns

`Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Promise resolving to backup data object

***

### buildIndex()

> `abstract` __buildIndex__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:192](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L192)

Build or rebuild the search index from all pages

Implementations should iterate through all pages and create
a complete search index from scratch.

#### Returns

`Promise`\<`void`\>

Promise that resolves when index building is complete

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:353](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L353)

Close/cleanup the search provider

Performs cleanup operations such as closing connections,
flushing buffers, and releasing resources.

#### Returns

`Promise`\<`void`\>

Promise that resolves when cleanup is complete

***

### getAllCategories()

> `abstract` __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: [src/providers/BaseSearchProvider.ts:277](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L277)

Get all unique categories from indexed documents

Extracts and returns a list of all unique categories
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique category names

***

### getAllUserKeywords()

> `abstract` __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: [src/providers/BaseSearchProvider.ts:288](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L288)

Get all unique user keywords from indexed documents

Extracts and returns a list of all unique user-defined keywords
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique keywords

***

### getDocumentCount()

> `abstract` __getDocumentCount__(): `Promise`\<`number`\>

Defined in: [src/providers/BaseSearchProvider.ts:331](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L331)

Get the total number of indexed documents

Returns a count of how many documents are currently in the index.

#### Returns

`Promise`\<`number`\>

Promise resolving to document count

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../interfaces/ProviderInfo.md)

Defined in: [src/providers/BaseSearchProvider.ts:174](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L174)

Get provider information

Returns metadata about this provider implementation including
name, version, description, and supported features.

#### Returns

[`ProviderInfo`](../interfaces/ProviderInfo.md)

Provider metadata

***

### getStatistics()

> `abstract` __getStatistics__(): `Promise`\<[`SearchStatistics`](../interfaces/SearchStatistics.md)\>

Defined in: [src/providers/BaseSearchProvider.ts:321](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L321)

Get search statistics

Returns statistics about the search index including document count,
index size, last update time, and other metrics.

#### Returns

`Promise`\<[`SearchStatistics`](../interfaces/SearchStatistics.md)\>

Promise resolving to search statistics object

***

### getSuggestions()

> `abstract` __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: [src/providers/BaseSearchProvider.ts:229](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L229)

Get search suggestions for autocomplete

Provides search term suggestions based on a partial input,
useful for implementing autocomplete functionality.

#### Parameters

##### partial

`string`

Partial search term

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of suggested completions

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:164](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L164)

Initialize the search provider

Implementations should load configuration from ConfigurationManager
and prepare the search backend for use.

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

***

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseSearchProvider.ts:342](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L342)

Check if the search provider is healthy/functional

Performs health checks on the search backend to verify it's
operational and responding correctly.

#### Returns

`Promise`\<`boolean`\>

Promise resolving to true if healthy, false otherwise

***

### removePageFromIndex()

> `abstract` __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:266](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L266)

Remove a page from the search index

Removes all entries for the specified page from the search index.

#### Parameters

##### pageName

`string`

Page name to remove

#### Returns

`Promise`\<`void`\>

Promise that resolves when removal is complete

***

### restore()

> __restore__(`_backupData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:382](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L382)

Restore search index from backup (optional)

Restores the search index from previously created backup data.
Default implementation does nothing.
Subclasses can override if they support restore functionality.

#### Parameters

##### \_backupData

[`BackupData`](../interfaces/BackupData.md)

Backup data to restore from

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

***

### search()

> `abstract` __search__(`query`, `options?`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: [src/providers/BaseSearchProvider.ts:205](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L205)

Search for pages matching the query

Performs a search against the index using the provided query
and optional search options.

#### Parameters

##### query

`string`

Search query string

##### options?

[`SearchOptions`](../interfaces/SearchOptions.md)

Search options for filtering and limiting results

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise resolving to array of search results

***

### searchByCategory()

> `abstract` __searchByCategory__(`category`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: [src/providers/BaseSearchProvider.ts:299](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L299)

Search by category only

Finds all pages that belong to the specified category.

#### Parameters

##### category

`string`

Category name to search for

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise resolving to array of pages in the category

***

### searchByUserKeywords()

> `abstract` __searchByUserKeywords__(`keyword`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: [src/providers/BaseSearchProvider.ts:310](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L310)

Search by user keywords only

Finds all pages that have the specified user keyword.

#### Parameters

##### keyword

`string`

Keyword to search for

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise resolving to array of pages with the keyword

***

### suggestSimilarPages()

> `abstract` __suggestSimilarPages__(`pageName`, `limit?`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: [src/providers/BaseSearchProvider.ts:242](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L242)

Suggest similar pages based on content

Finds pages similar to the specified page based on content
analysis and relevance scoring.

#### Parameters

##### pageName

`string`

Source page name to find similar pages for

##### limit?

`number`

Maximum number of suggestions to return (default: 5)

#### Returns

`Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Promise resolving to array of suggested similar pages

***

### updatePageInIndex()

> `abstract` __updatePageInIndex__(`pageName`, `pageData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseSearchProvider.ts:255](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L255)

Add or update a page in the search index

Updates the search index with the latest content and metadata
for the specified page.

#### Parameters

##### pageName

`string`

Page name to update

##### pageData

`Record`\<`string`, `unknown`\>

Page data including content and metadata

#### Returns

`Promise`\<`void`\>

Promise that resolves when update is complete
