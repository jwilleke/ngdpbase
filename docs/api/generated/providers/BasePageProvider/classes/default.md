[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BasePageProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BasePageProvider.ts:63

BasePageProvider - Abstract interface for page storage providers

All page storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of wiki pages, whether
from filesystem, database, cloud storage, or other backends.

This follows JSPWiki's provider pattern for pluggable storage backends.

 BasePageProvider

## See

- FileSystemProvider for filesystem implementation
- PageManager for usage

## Example

```ts
class MyProvider extends BasePageProvider {
  async initialize() {
    const config = this.engine.getManager('ConfigurationManager');
    this.storagePath = config.getProperty('myProvider.path');
  }
  async getPage(identifier: string) {
    // Implementation
  }
}
```

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileSystemProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BasePageProvider`

Defined in: src/providers/BasePageProvider.ts:84

Create a new page provider

#### Parameters

##### engine

[`WikiEngine`](../interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BasePageProvider`

#### Throws

If engine is not provided

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../interfaces/WikiEngine.md)

Defined in: src/providers/BasePageProvider.ts:65

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BasePageProvider.ts:68

Whether provider has been initialized

***

### privateStoreLayout

> `protected` __privateStoreLayout__: [`PrivateStoreLayout`](../../../utils/privateStorePath/type-aliases/PrivateStoreLayout.md)

Defined in: src/providers/BasePageProvider.ts:75

Private-store folder names (#1382). ConfigurationManager is the only
source; [applyPrivateStoreLayout](#applyprivatestorelayout) reads them in `initialize()`.
Defaults match `config/app-default-config.json`.

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

### applyPrivateStoreLayout()

> `protected` __applyPrivateStoreLayout__(`configManager`): `void`

Defined in: src/providers/BasePageProvider.ts:99

Read the private-store folder names from ConfigurationManager (via
getProperty, not getResolvedDataPath — they are segments under the pages
storagedir, joined by the helpers in `src/utils/privateStorePath.ts`).

#### Parameters

##### configManager

###### getProperty

(`key`, `defaultValue`) => `unknown`

#### Returns

`void`

***

### assertPrivateStoreWritable()

> `protected` __assertPrivateStoreWritable__(`ctx`, `pagesDirectory`, `owner`, `store`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:134

Refuse a write into an encrypted store this caller cannot write (#1394).
The one check every page provider calls before writing private bytes; the
keys are reached through the caller's context, never ambiently (P1).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### pagesDirectory

`string`

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`void`\>

***

### compareVersions()

> __compareVersions__(`_identifier`, `_v1`, `_v2`, `_ctx`): `Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Defined in: src/providers/BasePageProvider.ts:573

Compare two versions of a page

Generates a diff between two versions showing what changed.
Returns structured diff data suitable for rendering.

#### Parameters

##### \_identifier

`string`

##### \_v1

`number`

##### \_v2

`number`

##### \_ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Diff data structure

***

### deletePage()

> `abstract` __deletePage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/providers/BasePageProvider.ts:430

Delete a page

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is deleting (#1179). Names the deleter on the record and reaches a private store's keys (#1382)

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### dropStoreDeleted()

> `protected` __dropStoreDeleted__(`pagesDirectory`, `location`, `uuid`): `Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:278

Take one tombstone out; the entry it removed, or null when there was none.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### uuid

`string`

#### Returns

`Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md) \| `null`\>

***

### dropStorePage()

> `protected` __dropStorePage__(`pagesDirectory`, `location`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/providers/BasePageProvider.ts:185

Remove one page from its store's index; false when it was not listed.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### dropStoreSearchDocument()

> `protected` __dropStoreSearchDocument__(`pagesDirectory`, `location`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/providers/BasePageProvider.ts:342

Remove one page's document; false when it was not there.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### findInStorePages()

> `protected` `static` __findInStorePages__(`pages`, `key`): [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md) \| `null`

Defined in: src/providers/BasePageProvider.ts:217

One entry of a store's pages by uuid, title or slug (case-insensitive for the last two).

#### Parameters

##### pages

`Record`\<`string`, [`StorePageEntry`](../../../types/Provider/type-aliases/StorePageEntry.md)\>

##### key

`string`

#### Returns

[`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md) \| `null`

***

### findPage()

> `abstract` __findPage__(`identifier`): `string` \| `null`

Defined in: src/providers/BasePageProvider.ts:475

Find page by various identifiers

#### Parameters

##### identifier

`string`

UUID, title, or slug

#### Returns

`string` \| `null`

Canonical page title or null

***

### findStorePage()

> `protected` __findStorePage__(`pagesDirectory`, `location`, `key`): `Promise`\<[`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:229

One page of a store, by uuid, title or slug (case-insensitive for the
last two) — titles are unique within a store, never across the site.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### key

`string`

#### Returns

`Promise`\<[`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md) \| `null`\>

***

### getAllPageInfo()

> `abstract` __getAllPageInfo__(`options?`): `Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Defined in: src/providers/BasePageProvider.ts:468

Get all page info objects

#### Parameters

##### options?

[`PageListOptions`](../../../types/Page/interfaces/PageListOptions.md)

List options

#### Returns

`Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Array of page info objects

***

### getAllPageNames()

> __getAllPageNames__(): `Promise`\<`string`[]\>

Defined in: src/providers/BasePageProvider.ts:459

Get all page titles (explicit alias for getAllPages)
Prefer this for new code that only needs page names.
Use getAllPageInfo() when you need uuid/slug/author etc.

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

***

### getAllPages()

> `abstract` __getAllPages__(): `Promise`\<`string`[]\>

Defined in: src/providers/BasePageProvider.ts:451

Get all page titles

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

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

### getPage()

> `abstract` __getPage__(`identifier`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:379

Get complete page with content and metadata

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageBySlug()

> `abstract` __getPageBySlug__(`slug`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:498

Get a page by its slug

#### Parameters

##### slug

`string`

URL-friendly slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

***

### getPageByUUID()

> `abstract` __getPageByUUID__(`uuid`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:491

Get a page by its UUID

#### Parameters

##### uuid

`string`

Page UUID

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

***

### getPageContent()

> `abstract` __getPageContent__(`identifier`, `ctx`): `Promise`\<`string`\>

Defined in: src/providers/BasePageProvider.ts:390

Get only page content (without metadata)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

Markdown content

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageMetadata()

> `abstract` __getPageMetadata__(`identifier`, `ctx`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: src/providers/BasePageProvider.ts:401

Get only page metadata (without content)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Metadata object or null if not found

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### getPageUUID()

> __getPageUUID__(`_identifier`, `_ctx`): `string` \| `null`

Defined in: src/providers/BasePageProvider.ts:436

#### Parameters

##### \_identifier

`string`

##### \_ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`string` \| `null`

***

### getPageVersion()

> __getPageVersion__(`_identifier`, `_version`, `_ctx`): `Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Defined in: src/providers/BasePageProvider.ts:558

Get a specific version of a page

Retrieves the content and metadata for a specific version number.
For delta-based storage, this reconstructs the content by applying diffs.

#### Parameters

##### \_identifier

`string`

##### \_version

`number`

##### \_ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Version content and metadata

#### Throws

If version does not exist

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BasePageProvider.ts:595

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### getVersionHistory()

> __getVersionHistory__(`_identifier`, `_ctx`, `_limit?`): `Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: src/providers/BasePageProvider.ts:543

Get version history for a page

Returns an array of version metadata entries for the specified page.
Providers that don't support versioning should not implement this method.

#### Parameters

##### \_identifier

`string`

##### \_ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### \_limit?

`number`

#### Returns

`Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Array of version history entries

#### Example

```ts
// Returns:
[
  {
    version: 1,
    timestamp: "2025-01-01T00:00:00.000Z",
    author: "user@example.com",
    changeType: "create",
    message: "Initial version",
    contentSize: 1234,
    compressed: false
  },
  {
    version: 2,
    timestamp: "2025-01-02T10:30:00.000Z",
    author: "editor@example.com",
    changeType: "update",
    message: "Added section",
    contentSize: 567,
    compressed: false
  }
]
```

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:368

Initialize the provider with configuration

IMPORTANT: Providers MUST access configuration via ConfigurationManager:
  const configManager = this.engine.getManager('ConfigurationManager');
  const value = configManager.getProperty('key', 'default');

Do NOT read configuration files directly.

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### invalidatePageCache()

> __invalidatePageCache__(`_identifier`): `string` \| `null`

Defined in: src/providers/BasePageProvider.ts:432

#### Parameters

##### \_identifier

`string`

#### Returns

`string` \| `null`

***

### pageExists()

> `abstract` __pageExists__(`identifier`, `ctx`): `boolean`

Defined in: src/providers/BasePageProvider.ts:445

Check if page exists

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`boolean`

***

### purgeOldVersions()

> __purgeOldVersions__(`_identifier`, `_options?`): `Promise`\<\{ `dryRun`: `boolean`; `message`: `string`; `spaceFreed`: `number`; `versionsPurged`: `number`[]; `versionsRemoved`: `number`; \}\>

Defined in: src/providers/BasePageProvider.ts:587

Purge old versions based on retention policy

Removes old versions according to configuration settings (maxVersions, retentionDays).
Always preserves v1 (needed for delta reconstruction) and recent versions.

#### Parameters

##### \_identifier

`string`

##### \_options?

###### dryRun?

`boolean`

###### keepLatest?

`number`

###### keepMilestones?

`boolean`

###### retentionDays?

`number`

#### Returns

`Promise`\<\{ `dryRun`: `boolean`; `message`: `string`; `spaceFreed`: `number`; `versionsPurged`: `number`[]; `versionsRemoved`: `number`; \}\>

Purge result with versionsRemoved, versionsPurged, dryRun, spaceFreed, message

***

### putStoreDeleted()

> `protected` __putStoreDeleted__(`pagesDirectory`, `location`, `entry`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:267

Record one tombstone in its store's trash.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### entry

[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)

#### Returns

`Promise`\<`void`\>

***

### putStorePage()

> `protected` __putStorePage__(`pagesDirectory`, `location`, `entry`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:178

Add or replace one page in its store's index.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### entry

[`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)

#### Returns

`Promise`\<`void`\>

***

### putStoreSearchDocument()

> `protected` __putStoreSearchDocument__(`pagesDirectory`, `location`, `document`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:331

Add or replace one page's document in its store's search index.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### document

[`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)

#### Returns

`Promise`\<`void`\>

***

### readStoreDeleted()

> `protected` __readStoreDeleted__(`pagesDirectory`, `location`): `Promise`\<`Record`\<`string`, [`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)\>\>

Defined in: src/providers/BasePageProvider.ts:246

A store's tombstones, keyed by page uuid. A store that has never had a delete has none.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<`Record`\<`string`, [`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)\>\>

***

### readStorePages()

> `protected` __readStorePages__(`pagesDirectory`, `location`): `Promise`\<`Record`\<`string`, [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)\>\>

Defined in: src/providers/BasePageProvider.ts:157

A store's pages, keyed by uuid. A store with no pages yet has none.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<`Record`\<`string`, [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)\>\>

***

### readStorePagesSync()

> `protected` __readStorePagesSync__(`pagesDirectory`, `owner`, `store`, `ctx`): `Record`\<`string`, [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)\> \| `null`

Defined in: src/providers/BasePageProvider.ts:198

A store's pages, read synchronously as `ctx` may: null when the store is
encrypted and `ctx` does not hold its key. Page lookups are synchronous,
and the index is one small file (#1456).

#### Parameters

##### pagesDirectory

`string`

##### owner

`string`

##### store

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

#### Returns

`Record`\<`string`, [`UserCatalogPage`](../../../utils/privateStoreCatalogs/interfaces/UserCatalogPage.md)\> \| `null`

***

### readStoreSearch()

> `protected` __readStoreSearch__(`pagesDirectory`, `location`): `Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

Defined in: src/providers/BasePageProvider.ts:309

A store's search documents, keyed by page uuid. A store with no index yet has none.

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

***

### refreshPageList()

> `abstract` __refreshPageList__(): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:505

Refresh internal cache/index
Re-scans storage and rebuilds indexes

#### Returns

`Promise`\<`void`\>

***

### resolvePrivatePageStore()

> `protected` __resolvePrivatePageStore__(`requested`, `existing`, `moving?`): `string`

Defined in: src/providers/BasePageProvider.ts:119

Which store a private page is saved into — one rule for every page
provider (docs/private-stores.md, Store placement): the store the
save names, else the store the page is already in, else the configured
default. A store id is a plain slug.

A save that names a different store for a page that already exists is
refused unless it is an explicit move (#1505: `moveFrom`), which takes
the page and its history with it.

#### Parameters

##### requested

`unknown`

`metadata.store` from the save, if any

##### existing

`string` \| `undefined`

the store the page is in now, when it is an existing private page

##### moving?

`boolean` = `false`

the save is an explicit move to another store

#### Returns

`string`

***

### savePage()

> `abstract` __savePage__(`pageName`, `content`, `metadata`, `ctx`, `options?`): `Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

Defined in: src/providers/BasePageProvider.ts:416

Save page content and metadata

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

Markdown content

##### metadata

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> \| `undefined`

Frontmatter metadata

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is writing (#1179): the request's subject, or a JobContext. Mandatory and positional — a store write reaches this caller's keys through it (#1382)

##### options?

[`PageSaveOptions`](../../../types/Page/interfaces/PageSaveOptions.md)

Save options

#### Returns

`Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

#### Async

#### Throws

Always throws - must be implemented by subclass

***

### shutdown()

> __shutdown__(): `void`

Defined in: src/providers/BasePageProvider.ts:608

Shutdown the provider (cleanup resources)

#### Returns

`void`

***

### storeSearchFile()

> `protected` __storeSearchFile__(`pagesDirectory`, `owner`, `store`): `string`

Defined in: src/providers/BasePageProvider.ts:299

Where the store's search index lives — for a caller that must look at the file itself.

#### Parameters

##### pagesDirectory

`string`

##### owner

`string`

##### store

`string`

#### Returns

`string`

***

### storeSearchIndexExists()

> `protected` __storeSearchIndexExists__(`pagesDirectory`, `owner`, `store`): `Promise`\<`boolean`\>

Defined in: src/providers/BasePageProvider.ts:304

True when this store has a saved search index; false means it must be built.

#### Parameters

##### pagesDirectory

`string`

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`boolean`\>

***

### uuidHoldingName()

> `abstract` __uuidHoldingName__(`field`, `name`, `ctx`): `string` \| `null`

Defined in: src/providers/BasePageProvider.ts:484

The uuid of the page that holds `name` as its title, or as its slug (#2140)

#### Parameters

##### field

`"title"` \| `"slug"`

Which name: 'title' or 'slug'

##### name

`string`

The title or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is asking: a vault page's title is matched in its vault

#### Returns

`string` \| `null`

The holder's uuid, or null when no page holds it

***

### writeStoreDeleted()

> `protected` __writeStoreDeleted__(`pagesDirectory`, `location`, `deleted`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:256

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### deleted

`Record`\<`string`, [`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)\>

#### Returns

`Promise`\<`void`\>

***

### writeStorePages()

> `protected` __writeStorePages__(`pagesDirectory`, `location`, `pages`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:167

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### pages

`Record`\<`string`, [`StorePageEntry`](../../../types/Provider/type-aliases/StorePageEntry.md)\>

#### Returns

`Promise`\<`void`\>

***

### writeStoreSearch()

> `protected` __writeStoreSearch__(`pagesDirectory`, `location`, `documents`): `Promise`\<`void`\>

Defined in: src/providers/BasePageProvider.ts:319

#### Parameters

##### pagesDirectory

`string`

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### documents

`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>

#### Returns

`Promise`\<`void`\>
