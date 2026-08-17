[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/LunrSearchProvider](../README.md) / default

# Class: default

Defined in: [src/providers/LunrSearchProvider.ts:91](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L91)

LunrSearchProvider - Full-text search using Lunr.js

## Extends

- [`default`](../../BaseSearchProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `LunrSearchProvider`

Defined in: [src/providers/LunrSearchProvider.ts:96](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L96)

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

Defined in: [src/providers/BaseSearchProvider.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L140)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`engine`](../../BaseSearchProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/providers/BaseSearchProvider.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseSearchProvider.ts#L143)

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseSearchProvider/classes/default.md).[`initialized`](../../BaseSearchProvider/classes/default.md#initialized)

## Methods

### advancedSearch()

> __advancedSearch__(`options`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: [src/providers/LunrSearchProvider.ts:303](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L303)

Advanced search with multiple criteria

#### Parameters

##### options

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

Defined in: [src/providers/LunrSearchProvider.ts:677](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L677)

Backup search index and configuration

#### Returns

`Promise`\<[`BackupData`](../../BaseSearchProvider/interfaces/BackupData.md)\>

Backup data

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`backup`](../../BaseSearchProvider/classes/default.md#backup)

***

### buildIndex()

> __buildIndex__(): `Promise`\<`void`\>

Defined in: [src/providers/LunrSearchProvider.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L181)

Build search index from all pages

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`buildIndex`](../../BaseSearchProvider/classes/default.md#buildindex)

***

### close()

> __close__(): `Promise`\<`void`\>

Defined in: [src/providers/LunrSearchProvider.ts:660](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L660)

Close/cleanup the search provider

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`close`](../../BaseSearchProvider/classes/default.md#close)

***

### getAllCategories()

> __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: [src/providers/LunrSearchProvider.ts:530](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L530)

Get all unique categories from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of categories

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllCategories`](../../BaseSearchProvider/classes/default.md#getallcategories)

***

### getAllUserKeywords()

> __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: [src/providers/LunrSearchProvider.ts:544](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L544)

Get all unique user keywords from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of user keywords

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getAllUserKeywords`](../../BaseSearchProvider/classes/default.md#getalluserkeywords)

***

### getDocumentCount()

> __getDocumentCount__(): `Promise`\<`number`\>

Defined in: [src/providers/LunrSearchProvider.ts:636](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L636)

Get the total number of indexed documents

#### Returns

`Promise`\<`number`\>

Number of documents

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getDocumentCount`](../../BaseSearchProvider/classes/default.md#getdocumentcount)

***

### getProviderInfo()

> __getProviderInfo__(): `object`

Defined in: [src/providers/LunrSearchProvider.ts:168](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L168)

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

Defined in: [src/providers/LunrSearchProvider.ts:616](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L616)

Get search statistics

#### Returns

`Promise`\<[`SearchStatistics`](../../BaseSearchProvider/interfaces/SearchStatistics.md)\>

Search statistics

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`getStatistics`](../../BaseSearchProvider/classes/default.md#getstatistics)

***

### getSuggestions()

> __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: [src/providers/LunrSearchProvider.ts:427](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L427)

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

Defined in: [src/providers/LunrSearchProvider.ts:108](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L108)

Initialize the Lunr search provider
Loads configuration from ConfigurationManager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`initialize`](../../BaseSearchProvider/classes/default.md#initialize)

***

### isHealthy()

> __isHealthy__(): `Promise`\<`boolean`\>

Defined in: [src/providers/LunrSearchProvider.ts:644](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L644)

Check if the search provider is healthy/functional

#### Returns

`Promise`\<`boolean`\>

True if healthy

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`isHealthy`](../../BaseSearchProvider/classes/default.md#ishealthy)

***

### removePageFromIndex()

> __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: [src/providers/LunrSearchProvider.ts:515](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L515)

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

Defined in: [src/providers/LunrSearchProvider.ts:693](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L693)

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

> __search__(`query`, `options`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: [src/providers/LunrSearchProvider.ts:262](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L262)

Search for pages matching the query

#### Parameters

##### query

`string`

Search query

##### options

[`SearchOptions`](../../BaseSearchProvider/interfaces/SearchOptions.md) = `{}`

Search options

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Search results

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`search`](../../BaseSearchProvider/classes/default.md#search)

***

### searchByCategory()

> __searchByCategory__(`category`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: [src/providers/LunrSearchProvider.ts:564](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L564)

Search by category only

#### Parameters

##### category

`string`

Category to search for

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Pages in category

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`searchByCategory`](../../BaseSearchProvider/classes/default.md#searchbycategory)

***

### searchByUserKeywords()

> __searchByUserKeywords__(`keyword`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: [src/providers/LunrSearchProvider.ts:591](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L591)

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

> __suggestSimilarPages__(`pageName`, `limit`): `Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Defined in: [src/providers/LunrSearchProvider.ts:461](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L461)

Suggest similar pages based on content

#### Parameters

##### pageName

`string`

Source page name

##### limit

`number` = `5`

Maximum suggestions

#### Returns

`Promise`\<[`SearchResult`](../../BaseSearchProvider/interfaces/SearchResult.md)[]\>

Suggested pages

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`suggestSimilarPages`](../../BaseSearchProvider/classes/default.md#suggestsimilarpages)

***

### updatePageInIndex()

> __updatePageInIndex__(`_pageName`, `_pageData`): `Promise`\<`void`\>

Defined in: [src/providers/LunrSearchProvider.ts:504](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/LunrSearchProvider.ts#L504)

Add or update a page in the search index

#### Parameters

##### \_pageName

`string`

Page name

##### \_pageData

`Record`\<`string`, `unknown`\>

Page data

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSearchProvider/classes/default.md).[`updatePageInIndex`](../../BaseSearchProvider/classes/default.md#updatepageinindex)
