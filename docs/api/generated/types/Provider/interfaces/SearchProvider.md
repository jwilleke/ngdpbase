[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / SearchProvider

# Interface: SearchProvider

Defined in: src/types/Provider.ts:832

Search provider interface

Defines the contract for search backends (Lunr, Elasticsearch, etc.).

## Extends

- [`BaseProvider`](BaseProvider.md)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### getSuggestions()

> __getSuggestions__(`query`, `limit?`): `Promise`\<`string`[]\>

Defined in: src/types/Provider.ts:861

Get search suggestions

#### Parameters

##### query

`string`

Partial search query

##### limit?

`number`

Maximum suggestions to return

#### Returns

`Promise`\<`string`[]\>

Array of suggestions

***

### indexPage()

> __indexPage__(`page`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:838

Index a page

#### Parameters

##### page

[`WikiPage`](../../Page/interfaces/WikiPage.md)

Page to index

#### Returns

`Promise`\<`void`\>

Promise that resolves when indexing is complete

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### rebuildIndex()

> __rebuildIndex__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:867

Rebuild entire search index

#### Returns

`Promise`\<`void`\>

Promise that resolves when rebuild is complete

***

### removePage()

> __removePage__(`identifier`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:845

Remove page from index

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`void`\>

Promise that resolves when removal is complete

***

### restore()?

> `optional` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:82

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`restore`](BaseProvider.md#restore)

***

### search()

> __search__(`query`, `options?`): `Promise`\<[`PageSearchResult`](../../Page/interfaces/PageSearchResult.md)[]\>

Defined in: src/types/Provider.ts:853

Search pages

#### Parameters

##### query

`string`

Search query

##### options?

Search options

###### limit?

`number`

###### offset?

`number`

#### Returns

`Promise`\<[`PageSearchResult`](../../Page/interfaces/PageSearchResult.md)[]\>

Array of search results

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
