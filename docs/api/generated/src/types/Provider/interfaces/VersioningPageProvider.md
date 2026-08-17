[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Provider](../README.md) / VersioningPageProvider

# Interface: VersioningPageProvider

Defined in: [src/types/Provider.ts:157](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L157)

Versioning page provider interface

Extended page provider with version history capabilities.

## Extends

- [`PageProvider`](PageProvider.md)

## Properties

### engine

> __engine__: [`WikiEngine`](../../WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/types/Provider.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L37)

Reference to WikiEngine

#### Inherited from

[`PageProvider`](PageProvider.md).[`engine`](PageProvider.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/types/Provider.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L40)

Whether provider has been initialized

#### Inherited from

[`PageProvider`](PageProvider.md).[`initialized`](PageProvider.md#initialized)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [src/types/Provider.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L64)

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`PageProvider`](PageProvider.md).[`backup`](PageProvider.md#backup)

***

### cleanupVersions()

> __cleanupVersions__(`identifier`): `Promise`\<`number`\>

Defined in: [src/types/Provider.ts:195](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L195)

Delete old versions based on retention policy

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`number`\>

Number of versions deleted

***

### compareVersions()

> __compareVersions__(`identifier`, `fromVersion`, `toVersion`): `Promise`\<[`VersionDiff`](../../Version/interfaces/VersionDiff.md) \| `null`\>

Defined in: [src/types/Provider.ts:188](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L188)

Compare two versions

#### Parameters

##### identifier

`string`

Page UUID or title

##### fromVersion

`number`

Old version number

##### toVersion

`number`

New version number

#### Returns

`Promise`\<[`VersionDiff`](../../Version/interfaces/VersionDiff.md) \| `null`\>

Version diff object

***

### compressVersions()

> __compressVersions__(`identifier`, `olderThanDays?`): `Promise`\<`number`\>

Defined in: [src/types/Provider.ts:203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L203)

Compress old versions

#### Parameters

##### identifier

`string`

Page UUID or title

##### olderThanDays?

`number`

Compress versions older than N days

#### Returns

`Promise`\<`number`\>

Number of versions compressed

***

### deletePage()

> __deletePage__(`identifier`): `Promise`\<`boolean`\>

Defined in: [src/types/Provider.ts:116](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L116)

Delete a page

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`deletePage`](PageProvider.md#deletepage)

***

### findPage()

> __findPage__(`identifier`): `string` \| `null`

Defined in: [src/types/Provider.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L143)

Find page by various identifiers

#### Parameters

##### identifier

`string`

UUID, title, or slug

#### Returns

`string` \| `null`

Canonical page title or null

#### Inherited from

[`PageProvider`](PageProvider.md).[`findPage`](PageProvider.md#findpage)

***

### getAllPageInfo()

> __getAllPageInfo__(`options?`): `Promise`\<[`PageInfo`](../../Page/interfaces/PageInfo.md)[]\>

Defined in: [src/types/Provider.ts:136](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L136)

Get all page info objects

#### Parameters

##### options?

[`PageListOptions`](../../Page/interfaces/PageListOptions.md)

List options

#### Returns

`Promise`\<[`PageInfo`](../../Page/interfaces/PageInfo.md)[]\>

Array of page info objects

#### Inherited from

[`PageProvider`](PageProvider.md).[`getAllPageInfo`](PageProvider.md#getallpageinfo)

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: [src/types/Provider.ts:129](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L129)

Get all page titles

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

#### Inherited from

[`PageProvider`](PageProvider.md).[`getAllPages`](PageProvider.md#getallpages)

***

### getPage()

> __getPage__(`identifier`): `Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Defined in: [src/types/Provider.ts:85](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L85)

Get complete page with content and metadata

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPage`](PageProvider.md#getpage)

***

### getPageContent()

> __getPageContent__(`identifier`): `Promise`\<`string`\>

Defined in: [src/types/Provider.ts:92](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L92)

Get only page content (without metadata)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<`string`\>

Markdown content

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageContent`](PageProvider.md#getpagecontent)

***

### getPageMetadata()

> __getPageMetadata__(`identifier`): `Promise`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: [src/types/Provider.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L99)

Get only page metadata (without content)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

#### Returns

`Promise`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md) \| `null`\>

Metadata object or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageMetadata`](PageProvider.md#getpagemetadata)

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: [src/types/Provider.ts:58](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L58)

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`PageProvider`](PageProvider.md).[`getProviderInfo`](PageProvider.md#getproviderinfo)

***

### getVersion()

> __getVersion__(`identifier`, `version`): `Promise`\<[`VersionContent`](../../Version/interfaces/VersionContent.md) \| `null`\>

Defined in: [src/types/Provider.ts:172](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L172)

Get specific version content

#### Parameters

##### identifier

`string`

Page UUID or title

##### version

`number`

Version number

#### Returns

`Promise`\<[`VersionContent`](../../Version/interfaces/VersionContent.md) \| `null`\>

Version content object

***

### getVersionHistory()

> __getVersionHistory__(`identifier`, `limit?`): `Promise`\<[`VersionHistoryEntry`](../../Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: [src/types/Provider.ts:164](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L164)

Get version history for a page

#### Parameters

##### identifier

`string`

Page UUID or title

##### limit?

`number`

Maximum number of versions to return

#### Returns

`Promise`\<[`VersionHistoryEntry`](../../Version/interfaces/VersionHistoryEntry.md)[]\>

Array of version history entries

***

### getVersionManifest()

> __getVersionManifest__(`identifier`): `Promise`\<[`VersionManifest`](../../Version/interfaces/VersionManifest.md) \| `null`\>

Defined in: [src/types/Provider.ts:179](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L179)

Get version manifest

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<[`VersionManifest`](../../Version/interfaces/VersionManifest.md) \| `null`\>

Version manifest object

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L46)

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`initialize`](PageProvider.md#initialize)

***

### pageExists()

> __pageExists__(`identifier`): `boolean`

Defined in: [src/types/Provider.ts:123](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L123)

Check if page exists

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`boolean`

True if page exists

#### Inherited from

[`PageProvider`](PageProvider.md).[`pageExists`](PageProvider.md#pageexists)

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:149](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L149)

Refresh page cache

#### Returns

`Promise`\<`void`\>

Promise that resolves when refresh is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`refreshPageList`](PageProvider.md#refreshpagelist)

***

### restore()?

> `optional` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L71)

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`restore`](PageProvider.md#restore)

***

### savePage()

> __savePage__(`pageName`, `content`, `metadata?`, `options?`): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:109](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L109)

Save page content and metadata

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

Markdown content

##### metadata?

`Partial`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md)\>

Frontmatter metadata

##### options?

[`PageSaveOptions`](../../Page/interfaces/PageSaveOptions.md)

Save options

#### Returns

`Promise`\<`void`\>

Promise that resolves when save is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`savePage`](PageProvider.md#savepage)

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L52)

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`shutdown`](PageProvider.md#shutdown)
