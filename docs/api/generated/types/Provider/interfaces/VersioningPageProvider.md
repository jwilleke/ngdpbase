[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / VersioningPageProvider

# Interface: VersioningPageProvider

Defined in: src/types/Provider.ts:480

Versioning page provider interface

Extended page provider with version history capabilities.

## Extends

- [`PageProvider`](PageProvider.md)

## Methods

### adoptUserPageCatalog()?

> `optional` __adoptUserPageCatalog__(`ctx`): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:250

At unlock (#1456): move the owner's sealed pages from the user-level
catalog into each encrypted store's own page index. Optional capability —
only a provider that keeps private stores has one.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`number`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`adoptUserPageCatalog`](PageProvider.md#adoptuserpagecatalog)

***

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`PageProvider`](PageProvider.md).[`backup`](PageProvider.md#backup)

***

### cleanupVersions()

> __cleanupVersions__(`identifier`): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:518

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

> __compareVersions__(`identifier`, `fromVersion`, `toVersion`, `ctx`): `Promise`\<[`VersionDiff`](../../Version/interfaces/VersionDiff.md) \| `null`\>

Defined in: src/types/Provider.ts:511

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

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`VersionDiff`](../../Version/interfaces/VersionDiff.md) \| `null`\>

Version diff object

***

### compressVersions()

> __compressVersions__(`identifier`, `olderThanDays?`): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:526

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

### deletedPageForRestore()?

> `optional` __deletedPageForRestore__(`uuid`): `Promise`\<\{ `metadata`: [`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md); `name`: `string`; \} \| `null`\>

Defined in: src/types/Provider.ts:373

Where a trashed page would come back to, and its frontmatter, so the
write door can decide the restore before it happens (#1815, security
review L5): its title, or its vault name when it was deleted from a
vault. Null when the uuid is not in the trash.

#### Parameters

##### uuid

`string`

Page UUID

#### Returns

`Promise`\<\{ `metadata`: [`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md); `name`: `string`; \} \| `null`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`deletedPageForRestore`](PageProvider.md#deletedpageforrestore)

***

### deletePage()

> __deletePage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:243

Delete a page

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is deleting (#1179): names the deleter on the tombstone
             (#947) and reaches a private store's keys (#1382). Was
                   providers written before soft delete stay compatible.

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`deletePage`](PageProvider.md#deletepage)

***

### findPage()

> __findPage__(`identifier`): `string` \| `null`

Defined in: src/types/Provider.ts:400

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

Defined in: src/types/Provider.ts:393

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

### getAllPageNames()

> __getAllPageNames__(): `Promise`\<`string`[]\>

Defined in: src/types/Provider.ts:386

Get all page titles (explicit alias for getAllPages)
Prefer this for new code that only needs page names.

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

#### Inherited from

[`PageProvider`](PageProvider.md).[`getAllPageNames`](PageProvider.md#getallpagenames)

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: src/types/Provider.ts:379

Get all page titles

#### Returns

`Promise`\<`string`[]\>

Sorted array of page titles

#### Inherited from

[`PageProvider`](PageProvider.md).[`getAllPages`](PageProvider.md#getallpages)

***

### getPage()

> __getPage__(`identifier`, `ctx`): `Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/types/Provider.ts:202

Get complete page with content and metadata

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Page object or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPage`](PageProvider.md#getpage)

***

### getPageBySlug()

> __getPageBySlug__(`slug`, `ctx`): `Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/types/Provider.ts:424

Get a page by its slug

#### Parameters

##### slug

`string`

URL-friendly slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageBySlug`](PageProvider.md#getpagebyslug)

***

### getPageByUUID()

> __getPageByUUID__(`uuid`, `ctx`): `Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/types/Provider.ts:417

Get a page by its UUID

#### Parameters

##### uuid

`string`

Page UUID

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../Page/interfaces/WikiPage.md) \| `null`\>

Page or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageByUUID`](PageProvider.md#getpagebyuuid)

***

### getPageContent()

> __getPageContent__(`identifier`, `ctx`): `Promise`\<`string`\>

Defined in: src/types/Provider.ts:209

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

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageContent`](PageProvider.md#getpagecontent)

***

### getPageMetadata()

> __getPageMetadata__(`identifier`, `ctx`): `Promise`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: src/types/Provider.ts:216

Get only page metadata (without content)

#### Parameters

##### identifier

`string`

Page UUID, title, or slug

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md) \| `null`\>

Metadata object or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageMetadata`](PageProvider.md#getpagemetadata)

***

### getPagesByCreator()

> __getPagesByCreator__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

Defined in: src/types/Provider.ts:457

Return pages owned by the given user (#640).

"Owned" matches by `author` (any of `options.references`, #2097) or, on a
private page, by `creator`, its container owner's username. The visibility filter is intentionally NOT applied here
because by definition a user can see their own pages: the route handler
verifies that `username === currentUser.username` before calling this.

Source-of-truth: providers MUST read from in-memory state (pageIndex /
pageCache). Reuses [RecentChangeEntry](RecentChangeEntry.md) shape since the relevant fields
overlap.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`GetPagesByCreatorOptions`](GetPagesByCreatorOptions.md)

#### Returns

`Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPagesByCreator`](PageProvider.md#getpagesbycreator)

***

### getPagesByEditor()

> __getPagesByEditor__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

Defined in: src/types/Provider.ts:465

Return pages most recently edited by the given user (#640 Phase 2).
Match by `editor` — separate from `author`/`creator` because edits change
editor but not author. Visibility filter NOT applied (caller asks about
own activity).

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PagesScanOptions`](PagesScanOptions.md)

#### Returns

`Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPagesByEditor`](PageProvider.md#getpagesbyeditor)

***

### getPagesSharedWith()

> __getPagesSharedWith__(`principals`, `options?`): `Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

Defined in: src/types/Provider.ts:472

Return pages whose frontmatter audience contains any of the given
principals — i.e., pages explicitly shared with the user (#640 Phase 2).
Excludes pages the user already owns (those show up under `getPagesByCreator`).

#### Parameters

##### principals

`string`[]

##### options?

[`PagesScanOptions`](PagesScanOptions.md)

#### Returns

`Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPagesSharedWith`](PageProvider.md#getpagessharedwith)

***

### getPageUUID()

> __getPageUUID__(`identifier`, `ctx`): `string` \| `null`

Defined in: src/types/Provider.ts:339

Look up a page's UUID by any identifier (UUID, slug, or title).

#### Parameters

##### identifier

`string`

UUID, slug, or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

who is asking (#1418): the owner's unlocked sealed-store pages resolve only through it

#### Returns

`string` \| `null`

UUID string or null if not found

#### Inherited from

[`PageProvider`](PageProvider.md).[`getPageUUID`](PageProvider.md#getpageuuid)

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`PageProvider`](PageProvider.md).[`getProviderInfo`](PageProvider.md#getproviderinfo)

***

### getRawFile()?

> `optional` __getRawFile__(`identifier`): `Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

Defined in: src/types/Provider.ts:324

Read a page's file exactly as stored — frontmatter and body, unparsed and
unsanitised. Optional capability: only providers backed by a filesystem can
offer it, so callers must feature-detect rather than assume.

Declared here rather than asserted at the call site. It was previously
widened inline with `as PageProvider & { getRawFile?: ... }`, which
typescript-eslint 8.65 flags as an unnecessary assertion and its autofixer
removes — breaking the build, because the assertion was in fact
load-bearing. Putting the optional member on the interface where it belongs
satisfies both the compiler and the rule, instead of picking a side.

#### Parameters

##### identifier

`string`

UUID, slug, or title

#### Returns

`Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

The file path and raw contents, or null when unsupported/unknown

#### Inherited from

[`PageProvider`](PageProvider.md).[`getRawFile`](PageProvider.md#getrawfile)

***

### getRecentChanges()

> __getRecentChanges__(`ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

Defined in: src/types/Provider.ts:443

Return pages most recently modified, sorted descending by lastModified.

Visibility (#635): private pages are filtered out unless one of the caller's
principals is the page creator OR appears in the page's frontmatter audience.
An `admin` principal bypasses the filter — derived here, never passed as a
flag (#1116).

Source-of-truth: providers MUST read from in-memory state (e.g., pageIndex /
pageCache) — direct disk reads were what motivated this API.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`RecentChangesOptions`](RecentChangesOptions.md)

#### Returns

`Promise`\<[`RecentChangeEntry`](RecentChangeEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`getRecentChanges`](PageProvider.md#getrecentchanges)

***

### getVersion()

> __getVersion__(`identifier`, `version`): `Promise`\<[`VersionContent`](../../Version/interfaces/VersionContent.md) \| `null`\>

Defined in: src/types/Provider.ts:495

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

> __getVersionHistory__(`identifier`, `ctx`, `limit?`): `Promise`\<[`VersionHistoryEntry`](../../Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: src/types/Provider.ts:487

Get version history for a page

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### limit?

`number`

Maximum number of versions to return

#### Returns

`Promise`\<[`VersionHistoryEntry`](../../Version/interfaces/VersionHistoryEntry.md)[]\>

Array of version history entries

***

### getVersionManifest()

> __getVersionManifest__(`identifier`): `Promise`\<[`VersionManifest`](../../Version/interfaces/VersionManifest.md) \| `null`\>

Defined in: src/types/Provider.ts:502

Get version manifest

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<[`VersionManifest`](../../Version/interfaces/VersionManifest.md) \| `null`\>

Version manifest object

***

### hasStoreSearchIndex()?

> `optional` __hasStoreSearchIndex__(`owner`, `store`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:288

False means the store has no search index yet and one must be built from its pages.

#### Parameters

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`hasStoreSearchIndex`](PageProvider.md#hasstoresearchindex)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`initialize`](PageProvider.md#initialize)

***

### invalidatePageCache()

> __invalidatePageCache__(`identifier`): `string` \| `null`

Defined in: src/types/Provider.ts:331

Evict a single page from the provider's in-memory content/metadata cache.

#### Parameters

##### identifier

`string`

UUID, slug, or title

#### Returns

`string` \| `null`

resolved page title if an entry was evicted, null otherwise

#### Inherited from

[`PageProvider`](PageProvider.md).[`invalidatePageCache`](PageProvider.md#invalidatepagecache)

***

### isPageDeleted()?

> `optional` __isPageDeleted__(`uuid`): `boolean`

Defined in: src/types/Provider.ts:355

Whether a page uuid is in the trash (#1403). Optional: a provider without
soft delete has no trash, and callers treat its absence as false.

#### Parameters

##### uuid

`string`

Page UUID

#### Returns

`boolean`

True if the uuid has a trash entry

#### Inherited from

[`PageProvider`](PageProvider.md).[`isPageDeleted`](PageProvider.md#ispagedeleted)

***

### listPrivateStorePages()?

> `optional` __listPrivateStorePages__(`ctx`, `owner?`): `Promise`\<[`PrivateStorePageRef`](PrivateStorePageRef.md)[]\>

Defined in: src/types/Provider.ts:262

Every private page in the stores `ctx` can read (#1457), for a migration
that must visit them. `owner` narrows it to one user's stores; without it
every user with a private container is walked.

What comes back is what the context may already read: a sealed store
whose key this context does not hold contributes nothing, so a system
context sees the unencrypted stores and an owner's own context sees
theirs. Optional capability, like the catalog adoption above.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<[`PrivateStorePageRef`](PrivateStorePageRef.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`listPrivateStorePages`](PageProvider.md#listprivatestorepages)

***

### listStoreDeletedPages()?

> `optional` __listStoreDeletedPages__(`ctx`, `owner`): `Promise`\<[`StoreDeletedEntry`](StoreDeletedEntry.md)[]\>

Defined in: src/types/Provider.ts:296

A store's own trash (#1459). Optional capability, like the store page and
search indexes above, and reached the same way: the provider owns the
store's bytes and refuses a sealed store it has no key for; the page door
decides who may ask, with the requester's context, before calling.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

#### Returns

`Promise`\<[`StoreDeletedEntry`](StoreDeletedEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`listStoreDeletedPages`](PageProvider.md#liststoredeletedpages)

***

### pageExists()

> __pageExists__(`identifier`, `ctx`): `boolean`

Defined in: src/types/Provider.ts:346

Check if page exists

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`boolean`

True if page exists

#### Inherited from

[`PageProvider`](PageProvider.md).[`pageExists`](PageProvider.md#pageexists)

***

### purgeExpiredStoreTrash()?

> `optional` __purgeExpiredStoreTrash__(`ctx`, `owner?`): `Promise`\<[`StoreDeletedEntry`](StoreDeletedEntry.md)[]\>

Defined in: src/types/Provider.ts:307

Expire the tombstones past the retention window in every store `ctx` can
open. A background job holds no key, so it reaches the unencrypted stores
only; a sealed store's trash expires in its owner's own session (#1459).

Returns WHAT it purged, not how many: the provider owns the bytes and the
caller owns the audit record, so the caller needs the entries.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<[`StoreDeletedEntry`](StoreDeletedEntry.md)[]\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`purgeExpiredStoreTrash`](PageProvider.md#purgeexpiredstoretrash)

***

### purgeStorePage()?

> `optional` __purgeStorePage__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:298

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`purgeStorePage`](PageProvider.md#purgestorepage)

***

### readablePrivateStores()?

> `optional` __readablePrivateStores__(`owner`, `ctx`): `Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](PrivateStorePageRef.md)[]\>\>

Defined in: src/types/Provider.ts:273

One owner's private stores as `ctx` can read them (#1457), by store id.

A store whose index this context cannot open — sealed, and no key — is
ABSENT from the map. A store it can open but which holds no page is
present and empty. That difference is the whole point of this shape:
"cannot say" is not "not there", and a caller that renders an answer must
not turn the first into the second.

#### Parameters

##### owner

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](PrivateStorePageRef.md)[]\>\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`readablePrivateStores`](PageProvider.md#readableprivatestores)

***

### readStoreSearchDocuments()?

> `optional` __readStoreSearchDocuments__(`ctx`, `owner`, `store`): `Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

Defined in: src/types/Provider.ts:285

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`readStoreSearchDocuments`](PageProvider.md#readstoresearchdocuments)

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:430

Refresh page cache

#### Returns

`Promise`\<`void`\>

Promise that resolves when refresh is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`refreshPageList`](PageProvider.md#refreshpagelist)

***

### removeStoreSearchDocument()?

> `optional` __removeStoreSearchDocument__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:284

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`removeStoreSearchDocument`](PageProvider.md#removestoresearchdocument)

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

[`PageProvider`](PageProvider.md).[`restore`](PageProvider.md#restore)

***

### restoreDeletedPage()?

> `optional` __restoreDeletedPage__(`uuid`): `Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `string`; \}\>

Defined in: src/types/Provider.ts:363

Bring a trashed page back with its history (#947). Optional: a provider
without soft delete has nothing to restore.

#### Parameters

##### uuid

`string`

Page UUID

#### Returns

`Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `string`; \}\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`restoreDeletedPage`](PageProvider.md#restoredeletedpage)

***

### restoreStorePage()?

> `optional` __restoreStorePage__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<[`StoreRestoreResult`](../type-aliases/StoreRestoreResult.md)\>

Defined in: src/types/Provider.ts:297

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

##### uuid

`string`

#### Returns

`Promise`\<[`StoreRestoreResult`](../type-aliases/StoreRestoreResult.md)\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`restoreStorePage`](PageProvider.md#restorestorepage)

***

### savePage()

> __savePage__(`pageName`, `content`, `metadata`, `ctx`, `options?`): `Promise`\<[`SavedPage`](SavedPage.md)\>

Defined in: src/types/Provider.ts:227

Save page content and metadata

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

Markdown content

##### metadata

`Partial`\<[`PageFrontmatter`](../../Page/interfaces/PageFrontmatter.md)\> \| `undefined`

Frontmatter metadata

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PageSaveOptions`](../../Page/interfaces/PageSaveOptions.md)

Save options

#### Returns

`Promise`\<[`SavedPage`](SavedPage.md)\>

Where the page landed (#1462): the provider decides placement,
  so it is the one that can say — a private page's name is its path.

#### Inherited from

[`PageProvider`](PageProvider.md).[`savePage`](PageProvider.md#savepage)

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`PageProvider`](PageProvider.md).[`shutdown`](PageProvider.md#shutdown)

***

### updateStoreSearchDocument()?

> `optional` __updateStoreSearchDocument__(`ctx`, `owner`, `store`, `document`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:283

A store's own saved search index (#1458). Optional capability, like the
store page index above: only a provider that keeps private stores has one.

The provider owns the store's bytes — it seals them when the store is
sealed and refuses a locked one — and decides nothing about who may ask.
The page door does that, with the requester's context, before calling.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

##### document

[`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`updateStoreSearchDocument`](PageProvider.md#updatestoresearchdocument)

***

### uuidHoldingName()

> __uuidHoldingName__(`field`, `name`, `ctx`): `string` \| `null`

Defined in: src/types/Provider.ts:410

The uuid of the page that holds `name` as its title, or as its slug (#2140).
This is the store's uniqueness rule: see the provider's implementation.

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

#### Inherited from

[`PageProvider`](PageProvider.md).[`uuidHoldingName`](PageProvider.md#uuidholdingname)

***

### writeStoreSearchDocuments()?

> `optional` __writeStoreSearchDocuments__(`ctx`, `owner`, `store`, `documents`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:286

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

##### documents

`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`PageProvider`](PageProvider.md).[`writeStoreSearchDocuments`](PageProvider.md#writestoresearchdocuments)
