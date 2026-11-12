[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/LunrSearchProvider](../README.md) / default

# Class: default

Defined in: src/providers/LunrSearchProvider.ts:202

LunrSearchProvider - Full-text search using Lunr.js

## Extends

- [`default`](../../BaseSearchProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `LunrSearchProvider`

Defined in: src/providers/LunrSearchProvider.ts:210

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`LunrSearchProvider`

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

> __advancedSearch__(`options?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:687

Advanced search with multiple criteria

#### Parameters

##### options?

[`SearchCriteria`](../../BaseSearchProvider/interfaces/SearchCriteria.md) = `{}`

Search criteria

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Search results

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`advancedSearch`](../../BaseSearchProvider/classes/default.md#advancedsearch)

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)\>

Defined in: src/providers/LunrSearchProvider.ts:1332

Backup search index and configuration

#### Returns

`Promise`\<[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)\>

Backup data

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`backup`](../../BaseSearchProvider/classes/default.md#backup)

***

### buildIndex()

> __buildIndex__(): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:516

Build search index from all pages

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`buildIndex`](../../BaseSearchProvider/classes/default.md#buildindex)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:1308

Close/cleanup the search provider, flushing documents to disk

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`close`](../../BaseSearchProvider/classes/default.md#close)

***

### getAllCategories()

> __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: src/providers/LunrSearchProvider.ts:1131

Get all unique categories from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of categories

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllCategories`](../../BaseSearchProvider/classes/default.md#getallcategories)

***

### getAllDocuments()

> __getAllDocuments__(): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:1189

Search by category only

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Pages in category

***

### getAllSystemKeywords()

> __getAllSystemKeywords__(): `Promise`\<`string`[]\>

Defined in: src/providers/LunrSearchProvider.ts:1174

# 893: all unique system keywords (machine bucket) from indexed documents.
Mirrors getAllUserKeywords — same comma-join contract (#862). Previously
ES-only; needed on Lunr so the asset-picker system-keywords facet includes
index-derived terms like 'capture'.

#### Returns

`Promise`\<`string`[]\>

***

### getAllUserKeywords()

> __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: src/providers/LunrSearchProvider.ts:1158

Get all unique user keywords from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of user keywords

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllUserKeywords`](../../BaseSearchProvider/classes/default.md#getalluserkeywords)

***

### getDocumentCount()

> __getDocumentCount__(): `Promise`\<`number`\>

Defined in: src/providers/LunrSearchProvider.ts:1284

Get the total number of indexed documents

#### Returns

`Promise`\<`number`\>

Number of documents

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

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: src/providers/LunrSearchProvider.ts:503

Get provider information

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

> __getStatistics__(): `Promise`\<[`SearchStatistics`](../../BaseSearchProvider/interfaces/SearchStatistics.md)\>

Defined in: src/providers/LunrSearchProvider.ts:1264

Get search statistics

#### Returns

`Promise`\<[`SearchStatistics`](../../BaseSearchProvider/interfaces/SearchStatistics.md)\>

Search statistics

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getStatistics`](../../BaseSearchProvider/classes/default.md#getstatistics)

***

### getSuggestions()

> __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: src/providers/LunrSearchProvider.ts:982

Get search suggestions for autocomplete

#### Parameters

##### partial

`string`

Partial search term

#### Returns

`Promise`\<`string`[]\>

Suggested completions

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getSuggestions`](../../BaseSearchProvider/classes/default.md#getsuggestions)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:222

Initialize the Lunr search provider
Loads configuration from ConfigurationManager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`initialize`](../../BaseSearchProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: src/providers/LunrSearchProvider.ts:1292

Check if the search provider is healthy/functional

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`isHealthy`](../../BaseSearchProvider/classes/default.md#ishealthy)

***

### rebuild()

> __rebuild__(): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:1111

True rebuild from disk — mirrors MediaManager.rebuildIndex().

# 724: buildIndex() has a fast path that, when this.documents is
non-empty (always, in steady state), rebuilds Lunr from the persisted
map WITHOUT re-reading pages from disk. That makes a deleted page's
index entry ("ghost") unkillable — a normal reindex can never drop it.
rebuild() is the missing "Rebuild" half (vs the "Reindex"/rescan that
buildIndex provides): it clears the in-memory map AND deletes the
persisted documents.json, then forces the cold disk-scan path. Pages
that no longer exist on disk are dropped by construction.

documents.json is a derived cache (regenerated here from PageManager),
never source data — deleting it is safe and not the data/-tree rule.

#### Returns

`Promise`\<`void`\>

***

### removePageFromIndex()

> __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:1085

Remove a page from the search index

#### Parameters

##### pageName

`string`

Page name to remove

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`removePageFromIndex`](../../BaseSearchProvider/classes/default.md#removepagefromindex)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:1352

Restore search index from backup

#### Parameters

##### backupData

[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)

Backup data

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`restore`](../../BaseSearchProvider/classes/default.md#restore)

***

### search()

> __search__(`query`, `options?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:601

Search for pages matching the query

#### Parameters

##### query

`string`

Search query

##### options?

[`SearchOptions`](../../BaseSearchProvider/interfaces/SearchOptions.md) = `{}`

Search options

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Search results

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`search`](../../BaseSearchProvider/classes/default.md#search)

***

### searchByCategory()

> `abstract` __searchByCategory__(`category`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:1206

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

> __searchByUserKeywords__(`keyword`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:1233

Search by user keywords only

#### Parameters

##### keyword

`string`

Keyword to search for

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Pages with keyword

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`searchByUserKeywords`](../../BaseSearchProvider/classes/default.md#searchbyuserkeywords)

***

### suggestSimilarPages()

> __suggestSimilarPages__(`pageName`, `limit?`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: src/providers/LunrSearchProvider.ts:1016

Suggest similar pages based on content

#### Parameters

##### pageName

`string`

Source page name

##### limit?

`number` = `5`

Maximum suggestions

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Suggested pages

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`suggestSimilarPages`](../../BaseSearchProvider/classes/default.md#suggestsimilarpages)

***

### updatePageInIndex()

> __updatePageInIndex__(`pageName`, `pageData`): `Promise`\<`void`\>

Defined in: src/providers/LunrSearchProvider.ts:1059

Add or update a page in the search index incrementally

#### Parameters

##### pageName

`string`

Page name

##### pageData

`Record`\<`string`, `unknown`\>

Page data

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`updatePageInIndex`](../../BaseSearchProvider/classes/default.md#updatepageinindex)
