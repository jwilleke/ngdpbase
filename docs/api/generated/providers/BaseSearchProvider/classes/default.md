[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseSearchProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseSearchProvider.ts:190

BaseSearchProvider - Abstract base class for search providers

All search providers must extend this class and implement its abstract methods.
Provides a consistent interface for different search backend implementations.

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../ElasticsearchSearchProvider/classes/default.md)
- [`default`](../../LunrSearchProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseSearchProvider`

Defined in: src/providers/BaseSearchProvider.ts:202

Creates a new BaseSearchProvider instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Reference to the WikiEngine instance

#### Returns

`BaseSearchProvider`

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseSearchProvider.ts:192

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseSearchProvider.ts:195

Whether provider has been initialized

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerDescription`](../../BaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerFeatures`](../../BaseProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseProvider/classes/default.md).[`providerName`](../../BaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseProvider/classes/default.md).[`providerVersion`](../../BaseProvider/classes/default.md#providerversion)

## Methods

### advancedSearch()

> `abstract` __advancedSearch__(`criteria?`): `Promise`\<[`SearchResult`](../interfaces/SearchResult.md)[]\>

Defined in: src/providers/BaseSearchProvider.ts:270

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

Defined in: src/providers/BaseSearchProvider.ts:417

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

Defined in: src/providers/BaseSearchProvider.ts:245

Build or rebuild the search index from all pages

Implementations should iterate through all pages and create
a complete search index from scratch.

#### Returns

`Promise`\<`void`\>

Promise that resolves when index building is complete

***

### close()

> `abstract` __close__(): `Promise`\<`void`\>

Defined in: src/providers/BaseSearchProvider.ts:406

Close/cleanup the search provider

Performs cleanup operations such as closing connections,
flushing buffers, and releasing resources.

#### Returns

`Promise`\<`void`\>

Promise that resolves when cleanup is complete

***

### getAllCategories()

> `abstract` __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: src/providers/BaseSearchProvider.ts:330

Get all unique categories from indexed documents

Extracts and returns a list of all unique categories
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique category names

***

### getAllUserKeywords()

> `abstract` __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: src/providers/BaseSearchProvider.ts:341

Get all unique user keywords from indexed documents

Extracts and returns a list of all unique user-defined keywords
found in the indexed pages.

#### Returns

`Promise`\<`string`[]\>

Promise resolving to array of unique keywords

***

### getDocumentCount()

> `abstract` __getDocumentCount__(): `Promise`\<`number`\>

Defined in: src/providers/BaseSearchProvider.ts:384

Get the total number of indexed documents

Returns a count of how many documents are currently in the index.

#### Returns

`Promise`\<`number`\>

Promise resolving to document count

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

[`default`](../../BaseProvider/classes/default.md).[`getDurability`](../../BaseProvider/classes/default.md#getdurability)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseSearchProvider.ts:227

Get provider information

Returns metadata about this provider implementation including
name, version, description, and supported features.

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### getStatistics()

> `abstract` __getStatistics__(): `Promise`\<[`SearchStatistics`](../interfaces/SearchStatistics.md)\>

Defined in: src/providers/BaseSearchProvider.ts:374

Get search statistics

Returns statistics about the search index including document count,
index size, last update time, and other metrics.

#### Returns

`Promise`\<[`SearchStatistics`](../interfaces/SearchStatistics.md)\>

Promise resolving to search statistics object

***

### getSuggestions()

> `abstract` __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: src/providers/BaseSearchProvider.ts:282

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

Defined in: src/providers/BaseSearchProvider.ts:217

Initialize the search provider

Implementations should load configuration from ConfigurationManager
and prepare the search backend for use.

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

***

### isHealthy()

> `abstract` __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/BaseSearchProvider.ts:395

Check if the search provider is healthy/functional

Performs health checks on the search backend to verify it's
operational and responding correctly.

#### Returns

`Promise`\<`boolean`\>

Promise resolving to true if healthy, false otherwise

***

### removePageFromIndex()

> `abstract` __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: src/providers/BaseSearchProvider.ts:319

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

Defined in: src/providers/BaseSearchProvider.ts:435

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

Defined in: src/providers/BaseSearchProvider.ts:258

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

Defined in: src/providers/BaseSearchProvider.ts:352

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

Defined in: src/providers/BaseSearchProvider.ts:363

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

Defined in: src/providers/BaseSearchProvider.ts:295

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

Defined in: src/providers/BaseSearchProvider.ts:308

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
