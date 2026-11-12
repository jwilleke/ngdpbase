[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileSystemProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileSystemProvider.ts:158

FileSystemProvider - Markdown file-based page storage provider

Implements page storage using filesystem with YAML frontmatter metadata.
Pages are stored as .md files in configurable directories with UUID-based
filenames for reliable identification.

Key features:

- UUID-based file naming for reliable page identity
- Title-based lookup with case-insensitive matching
- Plural name matching support (e.g., "Page" matches "Pages")
- Dual storage locations (regular pages and required/system pages)
- In-memory caching with multiple lookup indexes
- Gray-matter for frontmatter parsing
- Configurable encoding support

Configuration keys (all lowercase):

- ngdpbase.page.provider.filesystem.storagedir - Main pages directory (getResolvedDataPath)
- ngdpbase.page.provider.filesystem.requiredpagesdir - Required pages directory
- ngdpbase.system-category - each entry's storageLocation.privatestore names the vault folder (#1504)
- ngdpbase.page.provider.filesystem.encoding - File encoding (default: utf-8)
- ngdpbase.translator-reader.match-english-plurals - Enable plural matching

 FileSystemProvider

## See

- [BasePageProvider](../../BasePageProvider/classes/default.md) for base interface
- PageManager for usage

## Extends

- [`default`](../../BasePageProvider/classes/default.md)

## Extended by

- [`default`](../../VersioningFileProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `FileSystemProvider`

Defined in: src/providers/FileSystemProvider.ts:202

Creates a new FileSystemProvider instance

#### Parameters

##### engine

[`WikiEngine`](../../BasePageProvider/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`FileSystemProvider`

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`constructor`](../../BasePageProvider/classes/default.md#constructor)

## Properties

### contentCache

> `protected` __contentCache__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:184

Content cache (title -> parsed content without frontmatter)

***

### encoding

> `protected` __encoding__: `BufferEncoding`

Defined in: src/providers/FileSystemProvider.ts:166

File encoding

***

### engine

> `protected` __engine__: [`WikiEngine`](../../BasePageProvider/interfaces/WikiEngine.md)

Defined in: src/providers/BasePageProvider.ts:65

Reference to the wiki engine

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`engine`](../../BasePageProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BasePageProvider.ts:68

Whether provider has been initialized

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`initialized`](../../BasePageProvider/classes/default.md#initialized)

***

### installationComplete

> __installationComplete__: `boolean`

Defined in: src/providers/FileSystemProvider.ts:194

Whether installation is complete (required-pages should not be used after install)

***

### pageCache

> `protected` __pageCache__: `Map`\<`string`, `PageCacheInfo`\>

Defined in: src/providers/FileSystemProvider.ts:169

Main page cache (keyed by title)

***

### pageNameMatcher

> `protected` __pageNameMatcher__: [`default`](../../../utils/PageNameMatcher/classes/default.md) \| `null`

Defined in: src/providers/FileSystemProvider.ts:181

Page name matcher for fuzzy/plural matching

***

### pagesDirectory

> `protected` __pagesDirectory__: `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:160

Path to regular pages directory

***

### privateStoreLayout

> `protected` __privateStoreLayout__: [`PrivateStoreLayout`](../../../utils/privateStorePath/type-aliases/PrivateStoreLayout.md)

Defined in: src/providers/BasePageProvider.ts:75

Private-store folder names (#1382). ConfigurationManager is the only
source; [applyPrivateStoreLayout](../../BasePageProvider/classes/default.md#applyprivatestorelayout) reads them in `initialize()`.
Defaults match `config/app-default-config.json`.

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`privateStoreLayout`](../../BasePageProvider/classes/default.md#privatestorelayout)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`providerDescription`](../../BasePageProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`providerFeatures`](../../BasePageProvider/classes/default.md#providerfeatures)

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

[`default`](../../BasePageProvider/classes/default.md).[`providerName`](../../BasePageProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`providerVersion`](../../BasePageProvider/classes/default.md#providerversion)

***

### requiredPagesDirectory

> `protected` __requiredPagesDirectory__: `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:163

Path to required pages directory

***

### slugIndex

> `protected` __slugIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:178

Slug index (slug -> canonical title)

***

### titleIndex

> `protected` __titleIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:172

Title index (lowercase title -> canonical title)

***

### uuidIndex

> `protected` __uuidIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:175

UUID index (UUID -> canonical title)

***

### vanishedInBackup

> `protected` __vanishedInBackup__: `number` = `0`

Defined in: src/providers/FileSystemProvider.ts:2147

Files and folders a running backup found deleted since they were listed (#1563); reset when a backup starts.

## Methods

### addToCaches()

> `protected` __addToCaches__(`info`, `content`): `void`

Defined in: src/providers/FileSystemProvider.ts:1658

Re-register a page in every in-memory cache and lookup index.

The inverse of [evictFromCaches](#evictfromcaches), used by the #947 restore path so a
recovered page is immediately resolvable without a provider reload.

#### Parameters

##### info

`PageCacheInfo`

Resolved page info for the page to register

##### content

`string`

Page body (frontmatter already stripped)

#### Returns

`void`

***

### adoptUserPageCatalog()

> __adoptUserPageCatalog__(`ctx`): `Promise`\<`number`\>

Defined in: src/providers/FileSystemProvider.ts:1439

At unlock (#1456): the owner's sealed pages move from the user-level
catalog (`user-index.json`, #1385) into each encrypted store's own sealed
page index. Idempotent; the catalog file is removed once every entry whose
page still exists is in its store's index.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

The owner's context, holding the unlocked store keys

#### Returns

`Promise`\<`number`\>

How many entries were moved

***

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`applyPrivateStoreLayout`](../../BasePageProvider/classes/default.md#applyprivatestorelayout)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`assertPrivateStoreWritable`](../../BasePageProvider/classes/default.md#assertprivatestorewritable)

***

### authorUsername()

> `protected` __authorUsername__(`author`): `Promise`\<`string` \| `undefined`\>

Defined in: src/providers/FileSystemProvider.ts:1136

The username a page's stored author names (#2097): an identity

#### Parameters

##### author

`unknown`

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Id

is
resolved through `IdentityManager.usernameOf`, an orphan names nobody,
a username not yet converted is itself. For the store a Private box moves
a page into, which is named by its owner's username.

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Defined in: src/providers/FileSystemProvider.ts:2064

Backup all pages to a serializable format

Returns all page files with their content and relative paths.
This allows the backup to be restored to different directory locations.

#### Returns

`Promise`\<[`BackupData`](../interfaces/BackupData.md)\>

Backup data containing all pages

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`compareVersions`](../../BasePageProvider/classes/default.md#compareversions)

***

### convertFileAuthorship()

> `protected` __convertFileAuthorship__(`io`, `file`, `convert`, `convertPrincipal?`): `Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; \}\>

Defined in: src/providers/FileSystemProvider.ts:1072

One page file's frontmatter `author` and `editor` through `convert`, and
the entries of its `audience` list through
`convertPrincipal` (#2097), rewritten line by line
([rewriteFrontmatterFields](../../../utils/frontmatterFieldRewrite/functions/rewriteFrontmatterFields.md)) and nothing else; the values it holds
afterwards. A file that is not there is `missing`; one whose lines cannot
be rewritten is left alone, `refused`.

#### Parameters

##### io

[`StoreFileIO`](../../../utils/privateStoreFiles/interfaces/StoreFileIO.md)

##### file

`string`

##### convert

(`stored`) => `Promise`\<`string`\>

##### convertPrincipal?

(`entry`) => `Promise`\<`string`\>

#### Returns

`Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; \}\>

***

### convertPageReferences()

> __convertPageReferences__(`ctx`, `identifier`, `convert`, `convertPrincipal?`): `Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; `uuid?`: `string`; \}\>

Defined in: src/providers/FileSystemProvider.ts:1019

Convert one page's stored `author` and `editor` (#2097), in its file and
in what the provider keeps about it, and nothing else: the body, every
other frontmatter field and `lastModified` stay byte-identical
([rewriteFrontmatterFields](../../../utils/frontmatterFieldRewrite/functions/rewriteFrontmatterFields.md)), and no version is made.

`convert` answers what a stored value becomes (PageManager asks
IdentityManager); it may throw (the identity store cannot answer), and
then nothing of this page is written. A page whose frontmatter cannot be
rewritten line by line is left alone and reported `refused`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### identifier

`string`

A public page's uuid or title, or a vault page's name

##### convert

(`stored`) => `Promise`\<`string`\>

##### convertPrincipal?

(`entry`) => `Promise`\<`string`\>

#### Returns

`Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; `uuid?`: `string`; \}\>

What happened to the file, and the author and editor it now holds

***

### deletePage()

> __deletePage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/providers/FileSystemProvider.ts:1576

Delete a page

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`deletePage`](../../BasePageProvider/classes/default.md#deletepage)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`dropStoreDeleted`](../../BasePageProvider/classes/default.md#dropstoredeleted)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`dropStorePage`](../../BasePageProvider/classes/default.md#dropstorepage)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`dropStoreSearchDocument`](../../BasePageProvider/classes/default.md#dropstoresearchdocument)

***

### evictFromCaches()

> `protected` __evictFromCaches__(`info`): `void`

Defined in: src/providers/FileSystemProvider.ts:1633

Drop a page from every in-memory cache and lookup index, leaving the file
on disk untouched.

Split out of [deletePage](#deletepage) for #947: the soft-delete path needs the
exact same cache teardown (so the page disappears from view, listing,
search and resolution) while relocating the file instead of unlinking it.
Keeping one implementation means a future cache can't be added to delete
and forgotten in soft-delete.

#### Parameters

##### info

`PageCacheInfo`

Resolved page info for the page to evict

#### Returns

`void`

***

### fileIOFor()

> `protected` __fileIOFor__(`ctx`, `file`): `Promise`\<[`StoreFileIO`](../../../utils/privateStoreFiles/interfaces/StoreFileIO.md)\>

Defined in: src/providers/FileSystemProvider.ts:304

How this caller reads and writes `file`: sealed with the store DEK when the
file sits in an encrypted store, refused when that DEK is not in the
caller's context, plain otherwise (#1415).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

##### file

`string`

#### Returns

`Promise`\<[`StoreFileIO`](../../../utils/privateStoreFiles/interfaces/StoreFileIO.md)\>

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`findInStorePages`](../../BasePageProvider/classes/default.md#findinstorepages)

***

### findLiveNameConflict()

> `protected` __findLiveNameConflict__(`title`, `slug?`): `"title"` \| `"slug"` \| `null`

Defined in: src/providers/FileSystemProvider.ts:1684

Whether a title or slug is currently claimed by a live page.

Used by the #947 restore path: a tombstoned page keeps its title and slug
only in the tombstone record, so nothing stops a NEW page from taking them
while the old one sits in the trash. Restoring blind would put two pages on
one title, so restore checks first and refuses.

#### Parameters

##### title

`string`

Title to test

##### slug?

`string`

Slug to test (optional)

#### Returns

`"title"` \| `"slug"` \| `null`

The conflicting field, or null when both are free

***

### findPage()

> __findPage__(`identifier`): `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:1783

Find page by various identifiers

#### Parameters

##### identifier

`string`

UUID, title, or slug

#### Returns

`string` \| `null`

Canonical page title or null

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`findPage`](../../BasePageProvider/classes/default.md#findpage)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`findStorePage`](../../BasePageProvider/classes/default.md#findstorepage)

***

### getAllPageInfo()

> __getAllPageInfo__(`_options?`): `Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:1766

Get all page info objects

#### Parameters

##### \_options?

[`PageListOptions`](../../../types/Page/interfaces/PageListOptions.md)

List options (unused, for future filtering)

#### Returns

`Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Array of page info objects

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getAllPageInfo`](../../BasePageProvider/classes/default.md#getallpageinfo)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`getAllPageNames`](../../BasePageProvider/classes/default.md#getallpagenames)

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1757

Returns a list of all available page titles (sorted)

#### Returns

`Promise`\<`string`[]\>

An array of page titles

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getAllPages`](../../BasePageProvider/classes/default.md#getallpages)

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

[`default`](../../BasePageProvider/classes/default.md).[`getDurability`](../../BasePageProvider/classes/default.md#getdurability)

***

### getPage()

> __getPage__(`identifier`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/FileSystemProvider.ts:566

Get page content and metadata together

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPage`](../../BasePageProvider/classes/default.md#getpage)

***

### getPageBySlug()

> __getPageBySlug__(`slug`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/FileSystemProvider.ts:623

Get a page by its slug (delegates to getPage — resolvePageInfo checks slugIndex)

#### Parameters

##### slug

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPageBySlug`](../../BasePageProvider/classes/default.md#getpagebyslug)

***

### getPageByUUID()

> __getPageByUUID__(`uuid`, `ctx`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: src/providers/FileSystemProvider.ts:616

Get a page by its UUID (delegates to getPage — resolvePageInfo checks uuidIndex first)

#### Parameters

##### uuid

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPageByUUID`](../../BasePageProvider/classes/default.md#getpagebyuuid)

***

### getPageContent()

> __getPageContent__(`identifier`, `ctx`): `Promise`\<`string`\>

Defined in: src/providers/FileSystemProvider.ts:653

Retrieves the raw markdown content of a page (without frontmatter).

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

The raw markdown content without frontmatter

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPageContent`](../../BasePageProvider/classes/default.md#getpagecontent)

***

### getPageMetadata()

> __getPageMetadata__(`identifier`, `ctx`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: src/providers/FileSystemProvider.ts:697

Retrieves the metadata (frontmatter) for a given page.

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

The page metadata, or null if not found

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPageMetadata`](../../BasePageProvider/classes/default.md#getpagemetadata)

***

### getPagesByCreator()

> __getPagesByCreator__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:1899

Pages owned by a user (#640). Base implementation: walks pageCache and
matches by metadata.author OR metadata.creator. VersioningFileProvider
overrides with the pageIndex-backed version which carries denormalised
fields for free.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`GetPagesByCreatorOptions`](../../../types/Provider/interfaces/GetPagesByCreatorOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### getPagesByEditor()

> __getPagesByEditor__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:1970

Pages edited by a user (#640 Phase 2). Walks pageCache, matches by
`metadata.editor`. VersioningFileProvider overrides with a pageIndex-
backed version.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### getPagesSharedWith()

> __getPagesSharedWith__(`principals`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:2015

Pages whose frontmatter audience contains any of the given principals
(#640 Phase 2). Walks pageCache. Excludes pages owned by any principal
(or, #2097, authored by one of `options.references`).

#### Parameters

##### principals

`string`[]

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

***

### getPageUUID()

> __getPageUUID__(`identifier`, `ctx`): `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:749

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`string` \| `null`

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getPageUUID`](../../BasePageProvider/classes/default.md#getpageuuid)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`getPageVersion`](../../BasePageProvider/classes/default.md#getpageversion)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/FileSystemProvider.ts:1792

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`getProviderInfo`](../../BasePageProvider/classes/default.md#getproviderinfo)

***

### getRawFile()

> __getRawFile__(`identifier`, `ctx`): `Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

Defined in: src/providers/FileSystemProvider.ts:634

Read the literal raw file content for a page — frontmatter YAML + body
markdown together, exactly as it appears on disk. Used by the admin
"Edit raw" UI (#689) to recover pages whose frontmatter is corrupted
in ways that the normal getPage() path sanitises or normalises away.
Returns null when the page is unknown (no page-index entry).

#### Parameters

##### identifier

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `content`: `string`; `filePath`: `string`; \} \| `null`\>

***

### getRecentChanges()

> __getRecentChanges__(`ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:1815

Default recent-changes implementation: derives entries from the in-memory
`pageCache` + each entry's metadata. VersioningFileProvider overrides with
a richer pageIndex-based version that includes editor / version info.

# 635: replaces the disk-read + per-page fs.stat() the RecentChangesPlugin
was doing. Honors private-page visibility based on the caller's principals.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`RecentChangesOptions`](../../../types/Provider/interfaces/RecentChangesOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`getVersionHistory`](../../BasePageProvider/classes/default.md#getversionhistory)

***

### hasAnySystemKeyword()

> `protected` `static` __hasAnySystemKeyword__(`metadata`, `wanted`): `boolean`

Defined in: src/providers/FileSystemProvider.ts:1884

True when the page's frontmatter `system-keywords` contains at least one of
`wanted` (case-insensitive) — the OR semantics #1004 needs, because an
instance may configure several capture keywords and a page carries whichever
was active when it was written.

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\> \| [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null` \| `undefined`

##### wanted

`Set`\<`string`\>

#### Returns

`boolean`

***

### hasStoreSearchIndex()

> __hasStoreSearchIndex__(`owner`, `store`): `Promise`\<`boolean`\>

Defined in: src/providers/FileSystemProvider.ts:1536

True when this store already has a saved search index (#1458).

#### Parameters

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`boolean`\>

***

### indexPlainStorePages()

> __indexPlainStorePages__(`known?`): `Promise`\<`number`\>

Defined in: src/providers/FileSystemProvider.ts:1376

Start-up migration (#1456), idempotent: every page file in an unencrypted
store is listed in that store's own page index, whether it was in the
global index before or in none. Entries already listed are kept as they
are. An encrypted store cannot be read here; its pages move in at their
owner's unlock ([adoptUserPageCatalog](#adoptuserpagecatalog)).

#### Parameters

##### known?

`Record`\<`string`, `Partial`\<[`StorePageEntry`](../../../types/Provider/type-aliases/StorePageEntry.md)\>\> = `{}`

What the global index said about private pages, by uuid;
  used for the version count, which is not in the page file

#### Returns

`Promise`\<`number`\>

How many entries were added

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:226

Initialize the provider by reading configuration and caching pages

Loads all pages from both directories into memory for fast lookup.
All configuration access goes through ConfigurationManager (ALL LOWERCASE).

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`initialize`](../../BasePageProvider/classes/default.md#initialize)

***

### invalidatePageCache()

> __invalidatePageCache__(`identifier`): `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:729

#### Parameters

##### identifier

`string`

#### Returns

`string` \| `null`

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`invalidatePageCache`](../../BasePageProvider/classes/default.md#invalidatepagecache)

***

### listAuthorshipRefs()

> __listAuthorshipRefs__(): `object`[]

Defined in: src/providers/FileSystemProvider.ts:994

The public pages' stored author and editor, as the provider holds them in
memory (#2097): the start-up conversion's list of pages to look at. A
page whose metadata is not loaded yet comes back without them.

#### Returns

`object`[]

***

### listPrivatePagesInStores()

> `protected` __listPrivatePagesInStores__(): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:1361

Start-up (#1456): every private page is listed in its store's own index.
VersioningFileProvider does this itself once its page index is loaded, so
the version counts the global index held are carried over.

#### Returns

`Promise`\<`void`\>

***

### listPrivateStorePages()

> __listPrivateStorePages__(`ctx`, `owner?`): `Promise`\<[`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>

Defined in: src/providers/FileSystemProvider.ts:1258

Every private page this context can read, for a migration that must visit
them (#1457). The stores are the ones the context may already open, so a
sealed store contributes nothing without its key and nothing here decides
access.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179)

##### owner?

`string`

One user's container, or every user's when omitted

#### Returns

`Promise`\<[`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>

***

### normalizeSystemKeywordFilter()

> `protected` `static` __normalizeSystemKeywordFilter__(`input?`): `Set`\<`string`\> \| `null`

Defined in: src/providers/FileSystemProvider.ts:1870

Lower-case and de-blank a caller-supplied system-keyword filter (#1004).
Returns null when there is nothing to filter on, so callers can skip the
per-page work entirely rather than testing against an empty set.

#### Parameters

##### input?

`string`[]

#### Returns

`Set`\<`string`\> \| `null`

***

### pageExists()

> __pageExists__(`identifier`, `ctx?`): `boolean`

Defined in: src/providers/FileSystemProvider.ts:1721

Check if a page exists

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx?

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`boolean`

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`pageExists`](../../BasePageProvider/classes/default.md#pageexists)

***

### privateOwners()

> `protected` __privateOwners__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1272

Every user with a private container, by folder name — the walk a
container-wide job starts from (#1457, #1459). Whether any of their stores
can be OPENED is a separate question the caller's context answers.

#### Returns

`Promise`\<`string`[]\>

***

### privatePlacement()

> `protected` __privatePlacement__(`pageName`, `md`, `uuid`, `previous`, `ctx`, `moveFrom?`, `authorName?`): \{ `owner`: `string`; `store`: `string`; \} \| `null`

Defined in: src/providers/FileSystemProvider.ts:1173

Where a save puts a private page (#1456), or null for a public one. A page
at a private name is private until the save says `private: false`; a plain
name is public until it says `private: true` (the Private box — a move into
the author's store). The owner is the name's, else the author. The store
follows the one rule every page provider shares
([BasePageProvider.resolvePrivatePageStore](../../BasePageProvider/classes/default.md#resolveprivatepagestore)): the store named — by the
page's name, else the save — else the store the page is in now, else the
default. "Now" is found by uuid among the owner's stores, so a save under
another name cannot leave a second copy of the page in a second store.

`moveFrom` (#1505) is an explicit move from another of the same owner's
stores: the page's name then names the store it goes to.

`authorName` is the username the page's author names ([authorUsername](#authorusername),
# 2097): the author is stored as an identity @id, and a store is named by
its owner's username.

#### Parameters

##### pageName

`string`

##### md

`Record`\<`string`, `unknown`\>

##### uuid

`string`

##### previous

`PageCacheInfo` \| `null`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### moveFrom?

`string`

##### authorName?

`string`

#### Returns

\{ `owner`: `string`; `store`: `string`; \} \| `null`

***

### privateStoreOf()

> `protected` __privateStoreOf__(`filePath`): `string` \| `undefined`

Defined in: src/providers/FileSystemProvider.ts:291

The store a page file sits in, read from its path; `undefined` when the
path is not a private store page.

#### Parameters

##### filePath

`string` \| `undefined`

#### Returns

`string` \| `undefined`

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`purgeOldVersions`](../../BasePageProvider/classes/default.md#purgeoldversions)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`putStoreDeleted`](../../BasePageProvider/classes/default.md#putstoredeleted)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`putStorePage`](../../BasePageProvider/classes/default.md#putstorepage)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`putStoreSearchDocument`](../../BasePageProvider/classes/default.md#putstoresearchdocument)

***

### readablePrivateStores()

> __readablePrivateStores__(`owner`, `ctx`): `Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>\>

Defined in: src/providers/FileSystemProvider.ts:1309

One owner's stores as this context can read them, by store id (#1457).

`readableStoresOf` already drops a store whose index it cannot open, and
keeps a readable one that is empty — so a store missing here is one this
reader cannot say anything about, and an empty one is a store with no
page in it. [listPrivateStorePages](#listprivatestorepages) is this, flattened.

#### Parameters

##### owner

`string`

Whose container

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179)

#### Returns

`Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>\>

***

### readableStoresOf()

> `protected` __readableStoresOf__(`owner`, `ctx`): `object`[]

Defined in: src/providers/FileSystemProvider.ts:1209

The owner's stores this context can read, with their page indexes (#1456).

#### Parameters

##### owner

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`object`[]

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`readStoreDeleted`](../../BasePageProvider/classes/default.md#readstoredeleted)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`readStorePages`](../../BasePageProvider/classes/default.md#readstorepages)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`readStorePagesSync`](../../BasePageProvider/classes/default.md#readstorepagessync)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`readStoreSearch`](../../BasePageProvider/classes/default.md#readstoresearch)

***

### readStoreSearchDocuments()

> __readStoreSearchDocuments__(`ctx`, `owner`, `store`): `Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

Defined in: src/providers/FileSystemProvider.ts:1517

One store's search documents, as this context may read them.

A locked encrypted store throws on the way to its I/O; the caller turns
that into "nothing", never into a plaintext read (#1415).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### store

`string`

#### Returns

`Promise`\<`Record`\<`string`, [`StoreSearchDocument`](../../../utils/storeSearchIndex/interfaces/StoreSearchDocument.md)\>\>

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:330

Reads all .md files from the pages directory (and required-pages during installation)
and populates the page cache with multiple indexes.

After installation is complete, only pages from the main pages directory are loaded.
The required-pages directory is only used during installation to seed the wiki.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`refreshPageList`](../../BasePageProvider/classes/default.md#refreshpagelist)

***

### removeStoreSearchDocument()

> __removeStoreSearchDocument__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/providers/FileSystemProvider.ts:1507

Remove one page's document from its store's search index.

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`resolvePrivatePageStore`](../../BasePageProvider/classes/default.md#resolveprivatepagestore)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:2307

Restore pages from backup data

Recreates all page files from the backup data.
Preserves directory structure and file content.

#### Parameters

##### backupData

[`BackupData`](../interfaces/BackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

***

### savePage()

> __savePage__(`pageName`, `content`, `metadata?`, `ctx`, `options?`): `Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

Defined in: src/providers/FileSystemProvider.ts:764

Saves content to a wiki page, creating it if it doesn't exist.
Determines storage location based on system-category metadata.

#### Parameters

##### pageName

`string`

The name of the page

##### content

`string`

The new markdown content

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

The metadata to save in the frontmatter

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is writing (#1179/#1382): a private store's keys are reached through it

##### options?

[`PageSaveOptions`](../../../types/Page/interfaces/PageSaveOptions.md)

Save options

#### Returns

`Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`savePage`](../../BasePageProvider/classes/default.md#savepage)

***

### shutdown()

> __shutdown__(): `void`

Defined in: src/providers/BasePageProvider.ts:608

Shutdown the provider (cleanup resources)

#### Returns

`void`

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`shutdown`](../../BasePageProvider/classes/default.md#shutdown)

***

### skipVanished()

> `protected` __skipVanished__(`error`, `what`): `void`

Defined in: src/providers/FileSystemProvider.ts:2155

A backup's read of `what` failed (#1563). Deleted since it was listed —
a page deleted while the site is backed up — it is skipped and counted,
never a failed backup. Any other error (EACCES, EIO, …) is rethrown, so
the backup is a failed one and says why.

#### Parameters

##### error

`unknown`

##### what

`string`

#### Returns

`void`

***

### storeEntriesFor()

> `protected` __storeEntriesFor__(`ctx`): [`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]

Defined in: src/providers/FileSystemProvider.ts:1232

The requester's own private pages, from their stores' indexes (#1456), as
list entries — for the lists that show a user their own pages beside the
public ones. Only the stores this context can read; none without one.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `undefined`

#### Returns

[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]

***

### storeIdsOf()

> `protected` __storeIdsOf__(`owner`): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1289

The store ids in one owner's container (#1459), readable or not.

Unlike [readableStoresOf](#readablestoresof), this does not open anything: a store with
no page in its index still has a trash, and a store this caller holds no
key for must still be VISITED so the caller can decide to skip it rather
than never see it.

#### Parameters

##### owner

`string`

#### Returns

`Promise`\<`string`[]\>

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`storeSearchFile`](../../BasePageProvider/classes/default.md#storesearchfile)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`storeSearchIndexExists`](../../BasePageProvider/classes/default.md#storesearchindexexists)

***

### titleExistsForDifferentPage()

> __titleExistsForDifferentPage__(`title`, `excludeUuid?`): `boolean`

Defined in: src/providers/FileSystemProvider.ts:1733

Check if a title is already in use by a different page.
Used to prevent duplicate titles on save/rename.

#### Parameters

##### title

`string`

The title to check

##### excludeUuid?

`string`

UUID of the page being saved (excluded from conflict check)

#### Returns

`boolean`

True if another page already has this title

***

### updateStoreSearchDocument()

> __updateStoreSearchDocument__(`ctx`, `owner`, `store`, `document`): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:1497

Add or replace one page's document in its store's search index.

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

***

### userReference()

> `protected` __userReference__(`username`): `Promise`\<`string`\>

Defined in: src/providers/FileSystemProvider.ts:1149

What a page record stores for the user `username` (#2097): a vault page's
author (its owner), a tombstone's `deletedBy`. Their identity @id, or the
username when there is none or the identity store cannot answer.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`string`\>

***

### uuidExistsForDifferentPage()

> __uuidExistsForDifferentPage__(`uuid`, `excludeTitle?`): `boolean`

Defined in: src/providers/FileSystemProvider.ts:1746

Check if a UUID is already assigned to a different page.
Used to prevent duplicate UUIDs on save.

#### Parameters

##### uuid

`string`

The UUID to check

##### excludeTitle?

`string`

Title of the page being saved (excluded from conflict check)

#### Returns

`boolean`

True if another page already has this UUID

***

### uuidHoldingName()

> __uuidHoldingName__(`field`, `name`, `ctx?`): `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:1706

The uuid of the page that holds `name` as its title, or as its slug (#2140).

This is the store's uniqueness rule, and the one place it is written: a
name is held when it is the same text ignoring case, as the title and
slug indexes fold it. A title is compared with titles and a slug with
slugs. Never plural or fuzzy matching: that is how a link finds a page
(`getPage`), not whether a name is taken, so "Reviews" and "review" are
two names. A vault page's title is matched in its own vault, as
`resolvePageInfo` finds it there.

#### Parameters

##### field

`"title"` \| `"slug"`

Which name: 'title' or 'slug'

##### name

`string`

The title or slug

##### ctx?

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who is asking: a sealed vault's index needs its owner's key

#### Returns

`string` \| `null`

The holder's uuid, or null when no page holds it

#### Overrides

[`default`](../../BasePageProvider/classes/default.md).[`uuidHoldingName`](../../BasePageProvider/classes/default.md#uuidholdingname)

***

### withPageWrite()

> __withPageWrite__\<`T`\>(`key`, `task`): `Promise`\<`T`\>

Defined in: src/providers/FileSystemProvider.ts:985

Run `task` as the only write on page `key`, a uuid (#2097). PageManager's
saves, deletes and authorship conversion take it, and so do this
provider's restores and purges of deleted pages, so the conversion never
writes a file back that a purge removed or a restore moved. Not
re-entrant: a task never takes the same key again.

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### task

() => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`writeStoreDeleted`](../../BasePageProvider/classes/default.md#writestoredeleted)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`writeStorePages`](../../BasePageProvider/classes/default.md#writestorepages)

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

#### Inherited from

[`default`](../../BasePageProvider/classes/default.md).[`writeStoreSearch`](../../BasePageProvider/classes/default.md#writestoresearch)

***

### writeStoreSearchDocuments()

> __writeStoreSearchDocuments__(`ctx`, `owner`, `store`, `documents`): `Promise`\<`void`\>

Defined in: src/providers/FileSystemProvider.ts:1526

Replace a store's whole search index — what a rebuild writes.

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
