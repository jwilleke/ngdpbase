[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/ElasticsearchSearchProvider](../README.md) / default

# Class: default

Defined in: src/providers/ElasticsearchSearchProvider.ts:137

BaseSearchProvider - Abstract base class for search providers

All search providers must extend this class and implement its abstract methods.
Provides a consistent interface for different search backend implementations.

## Extends

- [`default`](../../BaseSearchProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ElasticsearchSearchProvider`

Defined in: src/providers/ElasticsearchSearchProvider.ts:144

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`ElasticsearchSearchProvider`

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`constructor`](../../BaseSearchProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseSearchProvider.ts:192

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`engine`](../../BaseSearchProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseSearchProvider.ts:195

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`initialized`](../../BaseSearchProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`providerDescription`](../../BaseSearchProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`providerFeatures`](../../BaseSearchProvider/classes/default.md#providerfeatures)

***

### providerName?

> `protected` `optional` __providerName?__: `string`

Defined in: src/providers/BaseProvider.ts:73

What this provider calls itself (#1151).

`protected`, and set by a subclass in its constructor or field
initialisers. A provider that sets nothing reports the class name rather
than a placeholder, so the answer is never a lie — it is either what the
author chose or what the runtime knows.

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`providerName`](../../BaseSearchProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`providerVersion`](../../BaseSearchProvider/classes/default.md#providerversion)

## Methods

### advancedSearch()

> `abstract` __advancedSearch__(`criteria?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:288

Advanced search with multiple criteria

Performs a more complex search using multiple criteria including
query, categories, keywords, author, date range, etc.

#### Parameters

##### criteria?

[`SearchCriteria`](../../BaseSearchProvider/interfaces/SearchCriteria.md) = `{}`

Search criteria object

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Promise resolving to array of search results

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`advancedSearch`](../../BaseSearchProvider/classes/default.md#advancedsearch)

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:612

Backup search index and configuration (optional)

Creates a backup of the search index and configuration data.
Default implementation provides basic metadata.
Subclasses should override to include actual index data.

#### Returns

`Promise`\<[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)\>

Promise resolving to backup data object

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`backup`](../../BaseSearchProvider/classes/default.md#backup)

***

### buildIndex()

> `abstract` __buildIndex__(): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:198

Build or rebuild the search index from all pages

Implementations should iterate through all pages and create
a complete search index from scratch.

#### Returns

`Promise`\<`void`\>

Promise that resolves when index building is complete

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`buildIndex`](../../BaseSearchProvider/classes/default.md#buildindex)

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:599

Close/cleanup the search provider

Performs cleanup operations such as closing connections,
flushing buffers, and releasing resources.

#### Returns

`Promise`\<`void`\>

Promise that resolves when cleanup is complete

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`close`](../../BaseSearchProvider/classes/default.md#close)

***

### getAllCategories()

> `abstract` __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:446

Get all unique categories from indexed documents

Extracts and returns a list of all unique categories
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique category names

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllCategories`](../../BaseSearchProvider/classes/default.md#getallcategories)

***

### getAllSystemKeywords()

> __getAllSystemKeywords__(): `Promise`\<`string`[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:454

#### Returns

`Promise`\<`string`[]\>

***

### getAllUserKeywords()

> `abstract` __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:450

Get all unique user keywords from indexed documents

Extracts and returns a list of all unique user-defined keywords
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique keywords

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllUserKeywords`](../../BaseSearchProvider/classes/default.md#getalluserkeywords)

***

### getDocumentCount()

> `abstract` __getDocumentCount__(): `Promise`\<`number`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:575

Get the total number of indexed documents

Returns a count of how many documents are currently in the index.

#### Returns

`Promise`\<`number`\>

Promise resolving to document count

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getDocumentCount`](../../BaseSearchProvider/classes/default.md#getdocumentcount)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`getDurability`](../../BaseSearchProvider/classes/default.md#getdurability)

***

### getPageSystemKeywords()

> __getPageSystemKeywords__(`pageName`): `Promise`\<`string`[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:426

#### Parameters

##### pageName

`string`

#### Returns

`Promise`\<`string`[]\>

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: src/providers/ElasticsearchSearchProvider.ts:649

Get provider information

Returns metadata about this provider implementation including
name, version, description, and supported features.

#### Returns

`object`

Provider metadata

##### description

> __description__: `string`

##### features

> __features__: `string`[]

##### name

> __name__: `string`

##### version

> __version__: `string`

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getProviderInfo`](../../BaseSearchProvider/classes/default.md#getproviderinfo)

***

### getStatistics()

> `abstract` __getStatistics__(): `Promise`\<[`SearchStatistics`](../../BaseSearchProvider/interfaces/SearchStatistics.md)\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:549

Get search statistics

Returns statistics about the search index including document count,
index size, last update time, and other metrics.

#### Returns

`Promise`\<[`SearchStatistics`](../../BaseSearchProvider/interfaces/SearchStatistics.md)\>

Promise resolving to search statistics object

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getStatistics`](../../BaseSearchProvider/classes/default.md#getstatistics)

***

### getSuggestions()

> `abstract` __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:494

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

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getSuggestions`](../../BaseSearchProvider/classes/default.md#getsuggestions)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:152

Initialize the search provider

Implementations should load configuration from ConfigurationManager
and prepare the search backend for use.

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`initialize`](../../BaseSearchProvider/classes/default.md#initialize)

***

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:585

Check if the search provider is healthy/functional

Performs health checks on the search backend to verify it's
operational and responding correctly.

#### Returns

`Promise`\<`boolean`\>

Promise resolving to true if healthy, false otherwise

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`isHealthy`](../../BaseSearchProvider/classes/default.md#ishealthy)

***

### removePageFromIndex()

> `abstract` __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:411

Remove a page from the search index

Removes all entries for the specified page from the search index.

#### Parameters

##### pageName

`string`

Page name to remove

#### Returns

`Promise`\<`void`\>

Promise that resolves when removal is complete

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`removePageFromIndex`](../../BaseSearchProvider/classes/default.md#removepagefromindex)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:630

Restore search index from backup (optional)

Restores the search index from previously created backup data.
Default implementation does nothing.
Subclasses can override if they support restore functionality.

#### Parameters

##### backupData

[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`restore`](../../BaseSearchProvider/classes/default.md#restore)

***

### search()

> `abstract` __search__(`query`, `options?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:251

Search for pages matching the query

Performs a search against the index using the provided query
and optional search options.

#### Parameters

##### query

`string`

Search query string

##### options?

[`SearchOptions`](../../BaseSearchProvider/interfaces/SearchOptions.md) = `{}`

Search options for filtering and limiting results

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Promise resolving to array of search results

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`search`](../../BaseSearchProvider/classes/default.md#search)

***

### searchByCategory()

> `abstract` __searchByCategory__(`category`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:462

Search by category only

Finds all pages that belong to the specified category.

#### Parameters

##### category

`string`

Category name to search for

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Promise resolving to array of pages in the category

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`searchByCategory`](../../BaseSearchProvider/classes/default.md#searchbycategory)

***

### searchByUserKeywords()

> `abstract` __searchByUserKeywords__(`keyword`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:476

Search by user keywords only

Finds all pages that have the specified user keyword.

#### Parameters

##### keyword

`string`

Keyword to search for

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Promise resolving to array of pages with the keyword

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`searchByUserKeywords`](../../BaseSearchProvider/classes/default.md#searchbyuserkeywords)

***

### suggestSimilarPages()

> `abstract` __suggestSimilarPages__(`pageName`, `limit?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:513

Suggest similar pages based on content

Finds pages similar to the specified page based on content
analysis and relevance scoring.

#### Parameters

##### pageName

`string`

Source page name to find similar pages for

##### limit?

`number` = `5`

Maximum number of suggestions to return (default: 5)

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Promise resolving to array of suggested similar pages

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`suggestSimilarPages`](../../BaseSearchProvider/classes/default.md#suggestsimilarpages)

***

### updatePageInIndex()

> `abstract` __updatePageInIndex__(`pageName`, `pageData`): `Promise`\<`void`\>

Defined in: src/providers/ElasticsearchSearchProvider.ts:382

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

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`updatePageInIndex`](../../BaseSearchProvider/classes/default.md#updatepageinindex)
