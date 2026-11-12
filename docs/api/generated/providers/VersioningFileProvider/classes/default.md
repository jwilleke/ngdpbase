[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/VersioningFileProvider](../README.md) / default

# Class: default

Defined in: src/providers/VersioningFileProvider.ts:274

VersioningFileProvider - File-based storage with version history

Extends FileSystemProvider to add git-style page versioning with delta storage.
Maintains backward compatibility - can be swapped with FileSystemProvider.

Features:

- Per-page version history with delta storage (v1 = full, v2+ = diffs)
- Compression of old versions (gzip)
- Centralized page index for fast lookups (./data/page-index.json)
- Version metadata tracking (author, date, change type, content hash)
- Retention policies (maxVersions, retentionDays)

Directory Structure:

```
./data/page-index.json              # Centralized index for fast lookups
./pages/{uuid}.md                    # Current version of page
./pages/versions/{uuid}/
  ├── manifest.json                  # Single source of truth for all version metadata
  ├── v1/content.md                  # Full content (baseline)
  ├── v2/content.diff                # Delta from v1
  └── v3/content.diff                # Delta from v2
./required-pages/{uuid}.md
./required-pages/versions/{uuid}/... # Same structure for system pages
```

Note: Version metadata (author, date, hash, etc.) is stored ONLY in manifest.json
      to avoid data inconsistency. Individual v{N}/meta.json files are no longer used.

## Extends

- [`default`](../../FileSystemProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `VersioningFileProvider`

Defined in: src/providers/VersioningFileProvider.ts:317

Create a new VersioningFileProvider

#### Parameters

##### engine

[`WikiEngine`](../../BasePageProvider/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`VersioningFileProvider`

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`constructor`](../../FileSystemProvider/classes/default.md#constructor)

## Properties

### contentCache

> `protected` __contentCache__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:184

Content cache (title -> parsed content without frontmatter)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`contentCache`](../../FileSystemProvider/classes/default.md#contentcache)

***

### encoding

> `protected` __encoding__: `BufferEncoding`

Defined in: src/providers/FileSystemProvider.ts:166

File encoding

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`encoding`](../../FileSystemProvider/classes/default.md#encoding)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../BasePageProvider/interfaces/WikiEngine.md)

Defined in: src/providers/BasePageProvider.ts:65

Reference to the wiki engine

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`engine`](../../FileSystemProvider/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BasePageProvider.ts:68

Whether provider has been initialized

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`initialized`](../../FileSystemProvider/classes/default.md#initialized)

***

### installationComplete

> __installationComplete__: `boolean`

Defined in: src/providers/FileSystemProvider.ts:194

Whether installation is complete (required-pages should not be used after install)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`installationComplete`](../../FileSystemProvider/classes/default.md#installationcomplete)

***

### pageCache

> `protected` __pageCache__: `Map`\<`string`, `PageCacheInfo`\>

Defined in: src/providers/FileSystemProvider.ts:169

Main page cache (keyed by title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageCache`](../../FileSystemProvider/classes/default.md#pagecache)

***

### pageIndex

> `protected` __pageIndex__: `PageIndex` \| `null`

Defined in: src/providers/VersioningFileProvider.ts:299

In-memory page index cache

***

### pageNameMatcher

> `protected` __pageNameMatcher__: [`default`](../../../utils/PageNameMatcher/classes/default.md) \| `null`

Defined in: src/providers/FileSystemProvider.ts:181

Page name matcher for fuzzy/plural matching

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageNameMatcher`](../../FileSystemProvider/classes/default.md#pagenamematcher)

***

### pagesDirectory

> `protected` __pagesDirectory__: `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:160

Path to regular pages directory

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pagesDirectory`](../../FileSystemProvider/classes/default.md#pagesdirectory)

***

### privateStoreLayout

> `protected` __privateStoreLayout__: [`PrivateStoreLayout`](../../../utils/privateStorePath/type-aliases/PrivateStoreLayout.md)

Defined in: src/providers/BasePageProvider.ts:75

Private-store folder names (#1382). ConfigurationManager is the only
source; [applyPrivateStoreLayout](../../BasePageProvider/classes/default.md#applyprivatestorelayout) reads them in `initialize()`.
Defaults match `config/app-default-config.json`.

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`privateStoreLayout`](../../FileSystemProvider/classes/default.md#privatestorelayout)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`providerDescription`](../../FileSystemProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`providerFeatures`](../../FileSystemProvider/classes/default.md#providerfeatures)

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

[`default`](../../FileSystemProvider/classes/default.md).[`providerName`](../../FileSystemProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`providerVersion`](../../FileSystemProvider/classes/default.md#providerversion)

***

### requiredPagesDirectory

> `protected` __requiredPagesDirectory__: `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:163

Path to required pages directory

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`requiredPagesDirectory`](../../FileSystemProvider/classes/default.md#requiredpagesdirectory)

***

### slugIndex

> `protected` __slugIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:178

Slug index (slug -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`slugIndex`](../../FileSystemProvider/classes/default.md#slugindex)

***

### titleIndex

> `protected` __titleIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:172

Title index (lowercase title -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`titleIndex`](../../FileSystemProvider/classes/default.md#titleindex)

***

### uuidIndex

> `protected` __uuidIndex__: `Map`\<`string`, `string`\>

Defined in: src/providers/FileSystemProvider.ts:175

UUID index (UUID -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`uuidIndex`](../../FileSystemProvider/classes/default.md#uuidindex)

***

### vanishedInBackup

> `protected` __vanishedInBackup__: `number` = `0`

Defined in: src/providers/FileSystemProvider.ts:2147

Files and folders a running backup found deleted since they were listed (#1563); reset when a backup starts.

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`vanishedInBackup`](../../FileSystemProvider/classes/default.md#vanishedinbackup)

## Methods

### \_getVersionDirectory()

> __\_getVersionDirectory__(`uuid`, `location?`): `string`

Defined in: src/providers/VersioningFileProvider.ts:2022

Public alias for external tools (VersioningMaintenance, VersioningAnalytics)

#### Parameters

##### uuid

`string`

##### location?

`"private"` \| `"pages"` \| `"required-pages"` = `'pages'`

#### Returns

`string`

***

### \_resolveIdentifier()

> __\_resolveIdentifier__(`identifier`, `ctx?`): `Promise`\<\{ `location`: `"private"` \| `"pages"` \| `"required-pages"`; `owner?`: `string`; `store?`: `string`; `uuid`: `string`; \} \| `null`\>

Defined in: src/providers/VersioningFileProvider.ts:2027

Public alias for external tools (VersioningAnalytics)

#### Parameters

##### identifier

`string`

##### ctx?

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) = `ANONYMOUS_SUBJECT`

#### Returns

`Promise`\<\{ `location`: `"private"` \| `"pages"` \| `"required-pages"`; `owner?`: `string`; `store?`: `string`; `uuid`: `string`; \} \| `null`\>

***

### addToCaches()

> `protected` __addToCaches__(`info`, `content`): `void`

Defined in: src/providers/FileSystemProvider.ts:1658

Re-register a page in every in-memory cache and lookup index.

The inverse of [evictFromCaches](../../FileSystemProvider/classes/default.md#evictfromcaches), used by the #947 restore path so a
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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`addToCaches`](../../FileSystemProvider/classes/default.md#addtocaches)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`adoptUserPageCatalog`](../../FileSystemProvider/classes/default.md#adoptuserpagecatalog)

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

[`default`](../../FileSystemProvider/classes/default.md).[`applyPrivateStoreLayout`](../../FileSystemProvider/classes/default.md#applyprivatestorelayout)

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

[`default`](../../FileSystemProvider/classes/default.md).[`assertPrivateStoreWritable`](../../FileSystemProvider/classes/default.md#assertprivatestorewritable)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`authorUsername`](../../FileSystemProvider/classes/default.md#authorusername)

***

### backup()

> __backup__(): `Promise`\<`VersioningBackupData`\>

Defined in: src/providers/VersioningFileProvider.ts:3753

Back up pages and their version histories (#1380).

The parent walk skips every `versions/` directory, so each file under
`pages/versions/` and `required-pages/versions/` is added here, and the
public trash (#1409). Private stores travel whole, trash and history
included, through the parent's private-store backup (#1387).

#### Returns

`Promise`\<`VersioningBackupData`\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`backup`](../../FileSystemProvider/classes/default.md#backup)

***

### compareVersions()

> __compareVersions__(`identifier`, `v1`, `v2`, `ctx`): `Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Defined in: src/providers/VersioningFileProvider.ts:3606

Compare two versions of a page

Returns a diff showing changes between two versions.
Uses DeltaStorage to compute the diff.

#### Parameters

##### identifier

`string`

Page UUID or title

##### v1

`number`

First version number (older)

##### v2

`number`

Second version number (newer)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Comparison result with diff and stats

#### Throws

If page/versions not found

#### Example

```ts
const comparison = await provider.compareVersions('Main', 2, 5);
console.log(comparison.stats); // { additions: 10, deletions: 3, unchanged: 100 }
console.log(comparison.diff); // Array of diff operations
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`compareVersions`](../../FileSystemProvider/classes/default.md#compareversions)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`convertFileAuthorship`](../../FileSystemProvider/classes/default.md#convertfileauthorship)

***

### convertPageReferences()

> __convertPageReferences__(`ctx`, `identifier`, `convert`, `convertPrincipal?`): `Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; `uuid?`: `string`; `versions?`: `number`; \}\>

Defined in: src/providers/VersioningFileProvider.ts:924

[FileSystemProvider.convertPageReferences](../../FileSystemProvider/classes/default.md#convertpagereferences), plus what this provider
keeps about the page (#2097): its page index entry (saved by
[finishAuthorshipConversion](#finishauthorshipconversion)) or its vault's index entry, and its
version history's editors (`manifest.json`), rewritten in place: no
version is added, and every other field of every version is kept.
`versions` counts the version editors converted.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### identifier

`string`

##### convert

(`stored`) => `Promise`\<`string`\>

##### convertPrincipal?

(`entry`) => `Promise`\<`string`\>

#### Returns

`Promise`\<\{ `addon?`: `string`; `audience?`: `string`[]; `author?`: `string`; `category?`: `string`; `editor?`: `string`; `file`: `"refused"` \| `"changed"` \| `"missing"` \| `"unchanged"`; `uuid?`: `string`; `versions?`: `number`; \}\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`convertPageReferences`](../../FileSystemProvider/classes/default.md#convertpagereferences)

***

### convertStoreDeletedReferences()

> __convertStoreDeletedReferences__(`ctx`, `owner`, `convert`): `Promise`\<\{ `changed`: `number`; `errors`: `string`[]; `skipped`: `number`; \}\>

Defined in: src/providers/VersioningFileProvider.ts:1038

The tombstones in one owner's vaults this context can open (#2097):
`author`, `editor` and `deletedBy`, each deleted page's file and history.
A vault this context holds no key for is skipped. Each tombstone is
converted as the only write on its page, re-read from the vault's trash
index inside that lock and written only when it is still there. A
tombstone that fails for its own reason is skipped and counted.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

##### convert

(`stored`) => `Promise`\<`string`\>

#### Returns

`Promise`\<\{ `changed`: `number`; `errors`: `string`[]; `skipped`: `number`; \}\>

***

### deletedPageForRestore()

> __deletedPageForRestore__(`uuid`): `Promise`\<\{ `metadata`: [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md); `name`: `string`; \} \| `null`\>

Defined in: src/providers/VersioningFileProvider.ts:2704

Where a trashed page would come back to, and its frontmatter (#1815,
security review L5): the place restoreDeletedPageNow puts it,
read the same way, so PageManager decides the restore as a create there.

#### Parameters

##### uuid

`string`

UUID of the deleted page

#### Returns

`Promise`\<\{ `metadata`: [`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md); `name`: `string`; \} \| `null`\>

Its name (the vault name when it goes back into a vault) and metadata, or null

***

### deletePage()

> __deletePage__(`identifier`, `ctx`): `Promise`\<`boolean`\>

Defined in: src/providers/VersioningFileProvider.ts:2438

Soft-delete a page (#947).

Before this change a delete was the one destructive content action with no
undo: the page file, every stored version AND the index entry were removed
outright, so `POST /api/page/:identifier/restore/:version` had nothing left
to restore from and no way to resolve the identifier. Recovery depended
entirely on whatever backup retention a deployment happened to have.

Now the page file is MOVED into a `deleted/` directory beside its storage
root, the version directory is left completely untouched, and the index
entry moves from `pages` to `deletedPages` with the metadata restore needs.

The file has to move rather than stay put: the boot scan
(`FileSystemProvider.walkDir`) rebuilds the caches from disk, so a file
left in `pages/` would be re-indexed on the next restart and the page would
silently come back to life. `walkDir` skips `deleted/` for that reason.

Purging for real happens in [purgeExpiredDeletedPages](#purgeexpireddeletedpages) once the
retention window expires.

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

[`default`](../../FileSystemProvider/classes/default.md).[`deletePage`](../../FileSystemProvider/classes/default.md#deletepage)

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

[`default`](../../FileSystemProvider/classes/default.md).[`dropStoreDeleted`](../../FileSystemProvider/classes/default.md#dropstoredeleted)

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

[`default`](../../FileSystemProvider/classes/default.md).[`dropStorePage`](../../FileSystemProvider/classes/default.md#dropstorepage)

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

[`default`](../../FileSystemProvider/classes/default.md).[`dropStoreSearchDocument`](../../FileSystemProvider/classes/default.md#dropstoresearchdocument)

***

### evictFromCaches()

> `protected` __evictFromCaches__(`info`): `void`

Defined in: src/providers/FileSystemProvider.ts:1633

Drop a page from every in-memory cache and lookup index, leaving the file
on disk untouched.

Split out of [deletePage](../../FileSystemProvider/classes/default.md#deletepage) for #947: the soft-delete path needs the
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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`evictFromCaches`](../../FileSystemProvider/classes/default.md#evictfromcaches)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`fileIOFor`](../../FileSystemProvider/classes/default.md#fileiofor)

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

[`default`](../../FileSystemProvider/classes/default.md).[`findInStorePages`](../../FileSystemProvider/classes/default.md#findinstorepages)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`findLiveNameConflict`](../../FileSystemProvider/classes/default.md#findlivenameconflict)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`findPage`](../../FileSystemProvider/classes/default.md#findpage)

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

[`default`](../../FileSystemProvider/classes/default.md).[`findStorePage`](../../FileSystemProvider/classes/default.md#findstorepage)

***

### finishAuthorshipConversion()

> __finishAuthorshipConversion__(`convert`, `opts?`): `Promise`\<\{ `changed`: `number`; `errors`: `string`[]; `skipped`: `number`; \}\>

Defined in: src/providers/VersioningFileProvider.ts:989

The public tombstones' `author`, `editor` and `deletedBy` (#2097), on the
full pass also each deleted page's file and history, then the page index,
saved once. Each tombstone is converted as the only write on its page
([withPageWrite](#withpagewrite)), and only when it is still there, so a restore or
a purge meanwhile is never undone. A tombstone that fails for its own
reason is skipped and its error class counted; the identity store not
answering (`IdentityStoreUnavailableError`) stops the pass.

#### Parameters

##### convert

(`stored`) => `Promise`\<`string`\>

##### opts?

###### full?

`boolean`

#### Returns

`Promise`\<\{ `changed`: `number`; `errors`: `string`[]; `skipped`: `number`; \}\>

***

### flushWriteQueue()

> __flushWriteQueue__(): `Promise`\<`void`\>

Defined in: src/providers/VersioningFileProvider.ts:1086

Await any pending page-index writes. Call before process exit to prevent data loss.

#### Returns

`Promise`\<`void`\>

***

### getAddonSeededIndexEntries()

> __getAddonSeededIndexEntries__(): `object`[]

Defined in: src/providers/VersioningFileProvider.ts:1109

Every indexed page carrying an `addon` provenance stamp.

Reads the in-memory page index — no disk I/O and no dependency on
SearchManager. That matters: the orphan detector used to narrow candidates
with `searchByCategory('addon')`, which both missed seeded pages carrying a
different `system-category` and returned nothing at all when search was
unavailable.

Entries written before `addon` was indexed simply will not appear;
`AddonsManager` back-fills seeded pages at boot.

#### Returns

`object`[]

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getAllPageInfo`](../../FileSystemProvider/classes/default.md#getallpageinfo)

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

[`default`](../../FileSystemProvider/classes/default.md).[`getAllPageNames`](../../FileSystemProvider/classes/default.md#getallpagenames)

***

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1757

Returns a list of all available page titles (sorted)

#### Returns

`Promise`\<`string`[]\>

An array of page titles

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getAllPages`](../../FileSystemProvider/classes/default.md#getallpages)

***

### getDeletedPages()

> __getDeletedPages__(): `DeletedPageEntry`[]

Defined in: src/providers/VersioningFileProvider.ts:2663

List soft-deleted pages, newest deletion first (#947).

#### Returns

`DeletedPageEntry`[]

Tombstone records awaiting restore or purge

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

[`default`](../../FileSystemProvider/classes/default.md).[`getDurability`](../../FileSystemProvider/classes/default.md#getdurability)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPage`](../../FileSystemProvider/classes/default.md#getpage)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageBySlug`](../../FileSystemProvider/classes/default.md#getpagebyslug)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageByUUID`](../../FileSystemProvider/classes/default.md#getpagebyuuid)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageContent`](../../FileSystemProvider/classes/default.md#getpagecontent)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageMetadata`](../../FileSystemProvider/classes/default.md#getpagemetadata)

***

### getPagesByCreator()

> __getPagesByCreator__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:1215

Pages owned by a user — backed by pageIndex (#640). Match by `author`
(canonical; any of `options.references`, #2097) OR, on a private page,
`creator` (its container owner's username). Visibility filter intentionally
skipped — caller is asking about their own pages.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`GetPagesByCreatorOptions`](../../../types/Provider/interfaces/GetPagesByCreatorOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getPagesByCreator`](../../FileSystemProvider/classes/default.md#getpagesbycreator)

***

### getPagesByEditor()

> __getPagesByEditor__(`username`, `ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:1285

Pages most recently edited by a user (#640 Phase 2). Backed by pageIndex.

#### Parameters

##### username

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getPagesByEditor`](../../FileSystemProvider/classes/default.md#getpagesbyeditor)

***

### getPagesSharedWith()

> __getPagesSharedWith__(`principals`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:1339

Pages whose frontmatter audience contains any of the given principals
(#640 Phase 2). Excludes pages owned by any of those principals — the
intent is "shared WITH me", not "mine via audience".

# 1054: reads real frontmatter through the shared Tier 1 evaluator, not
`pageIndex.audienceRoles`. That field is denormalised AT WRITE TIME, so any
page not re-saved since #754 carries an empty list — 347 pages in the
corpus have an audience, 2 have a populated index entry. Backed by the
index, this method silently omitted 345 of the pages it exists to show.

It failed the opposite way to getRecentChanges, which over-listed on the
same stale data. Under-reporting here was harmless, but the two disagreed
about what an audience means, which is the disagreement #1054 removed.

#### Parameters

##### principals

`string`[]

##### options?

[`PagesScanOptions`](../../../types/Provider/interfaces/PagesScanOptions.md) = `{}`

#### Returns

`Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getPagesSharedWith`](../../FileSystemProvider/classes/default.md#getpagessharedwith)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageUUID`](../../FileSystemProvider/classes/default.md#getpageuuid)

***

### getPageVersion()

> __getPageVersion__(`identifier`, `version`, `ctx`): `Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Defined in: src/providers/VersioningFileProvider.ts:3524

Get specific version content for a page

Reconstructs the content for a specific version by:

1. Reading v1 (full content)
2. If version > 1 and delta storage enabled: apply diffs sequentially
3. If version > 1 and delta storage disabled: read full content directly

#### Parameters

##### identifier

`string`

Page UUID or title

##### version

`number`

Version number to retrieve

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Version content and metadata

#### Throws

If page/version not found or reconstruction fails

#### Example

```ts
const { content, metadata } = await provider.getPageVersion('Main', 2);
console.log(content); // Content at version 2
console.log(metadata.author); // Editor of version 2
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getPageVersion`](../../FileSystemProvider/classes/default.md#getpageversion)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/VersioningFileProvider.ts:3901

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getProviderInfo`](../../FileSystemProvider/classes/default.md#getproviderinfo)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getRawFile`](../../FileSystemProvider/classes/default.md#getrawfile)

***

### getRecentChanges()

> __getRecentChanges__(`ctx`, `options?`): `Promise`\<[`RecentChangeEntry`](../../../types/Provider/interfaces/RecentChangeEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:1136

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

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getRecentChanges`](../../FileSystemProvider/classes/default.md#getrecentchanges)

***

### getVersionHistory()

> __getVersionHistory__(`identifier`, `ctx`, `limit?`): `Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:3471

Get version history for a page

Returns an array of version metadata sorted by version number (newest first).
Each entry includes: version, dateCreated, editor, changeType, comment, contentHash, contentSize.

#### Parameters

##### identifier

`string`

Page UUID or title

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### limit?

`number`

Maximum number of versions to return (optional)

#### Returns

`Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Array of version metadata (empty array if no versions)

#### Throws

If page not found

#### Example

```ts
const history = await provider.getVersionHistory('Main');
// [
//   { version: 3, timestamp: '2024-01-03T...', author: 'john', ... },
//   { version: 2, timestamp: '2024-01-02T...', author: 'jane', ... },
//   { version: 1, timestamp: '2024-01-01T...', author: 'admin', ... }
// ]
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getVersionHistory`](../../FileSystemProvider/classes/default.md#getversionhistory)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`hasAnySystemKeyword`](../../FileSystemProvider/classes/default.md#hasanysystemkeyword)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`hasStoreSearchIndex`](../../FileSystemProvider/classes/default.md#hasstoresearchindex)

***

### indexPlainStorePages()

> __indexPlainStorePages__(`known?`): `Promise`\<`number`\>

Defined in: src/providers/FileSystemProvider.ts:1376

Start-up migration (#1456), idempotent: every page file in an unencrypted
store is listed in that store's own page index, whether it was in the
global index before or in none. Entries already listed are kept as they
are. An encrypted store cannot be read here; its pages move in at their
owner's unlock ([adoptUserPageCatalog](../../FileSystemProvider/classes/default.md#adoptuserpagecatalog)).

#### Parameters

##### known?

`Record`\<`string`, `Partial`\<[`StorePageEntry`](../../../types/Provider/type-aliases/StorePageEntry.md)\>\> = `{}`

What the global index said about private pages, by uuid;
  used for the version count, which is not in the page file

#### Returns

`Promise`\<`number`\>

How many entries were added

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`indexPlainStorePages`](../../FileSystemProvider/classes/default.md#indexplainstorepages)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/VersioningFileProvider.ts:357

Initialize the versioning provider

Optimized startup flow:

1. Load config and check for existing page index
2. If page index exists with entries, populate cache from index (fast - avoids NAS dir scan)
3. If no index, fall back to parent's directory scanning
4. Create version directories
5. Load or create page-index.json

#### Returns

`Promise`\<`void`\>

Promise<void>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`initialize`](../../FileSystemProvider/classes/default.md#initialize)

***

### invalidatePageCache()

> __invalidatePageCache__(`identifier`): `string` \| `null`

Defined in: src/providers/FileSystemProvider.ts:729

#### Parameters

##### identifier

`string`

#### Returns

`string` \| `null`

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`invalidatePageCache`](../../FileSystemProvider/classes/default.md#invalidatepagecache)

***

### isPageDeleted()

> __isPageDeleted__(`uuid`): `boolean`

Defined in: src/providers/VersioningFileProvider.ts:2692

Whether a page uuid is in the trash (#1403).

#### Parameters

##### uuid

`string`

Page UUID

#### Returns

`boolean`

True if the uuid has a trash entry

***

### listAuthorshipRefs()

> __listAuthorshipRefs__(): `object`[]

Defined in: src/providers/VersioningFileProvider.ts:907

The public pages' stored author and editor, from the page index (#2097).
A legacy `private` entry (a private page from before vaults, still
waiting to move into its owner's vault) is left out: the move finds its
old folder by the author's username.

#### Returns

`object`[]

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`listAuthorshipRefs`](../../FileSystemProvider/classes/default.md#listauthorshiprefs)

***

### listPrivatePagesInStores()

> `protected` __listPrivatePagesInStores__(): `Promise`\<`void`\>

Defined in: src/providers/VersioningFileProvider.ts:424

Start-up migration (#1456), idempotent: private pages leave the global
page index. Every unencrypted store lists its pages in its own index
(carrying over the version count the global entry had); the global entries
are then removed. Sealed pages were never here — they move from the
owner's user-level catalog at unlock.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`listPrivatePagesInStores`](../../FileSystemProvider/classes/default.md#listprivatepagesinstores)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`listPrivateStorePages`](../../FileSystemProvider/classes/default.md#listprivatestorepages)

***

### listStoreDeletedPages()

> __listStoreDeletedPages__(`ctx`, `owner`): `Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:2936

One owner's deleted private pages, from the stores `ctx` can open (#1459).

A store whose key this context does not hold contributes nothing — a
locked store's trash reads as no entries, never in the clear. Newest
deletion first, with a uuid tie-break so a listing does not reorder itself
between two requests (the title is not used: #1461 keeps private titles
out of ordering decisions that end up in logs).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner

`string`

#### Returns

`Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`normalizeSystemKeywordFilter`](../../FileSystemProvider/classes/default.md#normalizesystemkeywordfilter)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageExists`](../../FileSystemProvider/classes/default.md#pageexists)

***

### privateOwners()

> `protected` __privateOwners__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1272

Every user with a private container, by folder name — the walk a
container-wide job starts from (#1457, #1459). Whether any of their stores
can be OPENED is a separate question the caller's context answers.

#### Returns

`Promise`\<`string`[]\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`privateOwners`](../../FileSystemProvider/classes/default.md#privateowners)

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

`authorName` is the username the page's author names ([authorUsername](../../FileSystemProvider/classes/default.md#authorusername),
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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`privatePlacement`](../../FileSystemProvider/classes/default.md#privateplacement)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`privateStoreOf`](../../FileSystemProvider/classes/default.md#privatestoreof)

***

### purgeDeletedPage()

> __purgeDeletedPage__(`uuid`): `Promise`\<`boolean`\>

Defined in: src/providers/VersioningFileProvider.ts:2823

purgeDeletedPageNow as the only write on the page (#2097, [withPageWrite](#withpagewrite)).

#### Parameters

##### uuid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### purgeExpiredDeletedPages()

> __purgeExpiredDeletedPages__(`ctx?`): `Promise`\<`number`\>

Defined in: src/providers/VersioningFileProvider.ts:2862

Purge soft-deleted pages past the retention window (#947).

A retention of 0 disables purging entirely — tombstones are kept until an
admin removes them explicitly.

#### Parameters

##### ctx?

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md) = `...`

#### Returns

`Promise`\<`number`\>

Number of pages purged

***

### purgeExpiredStoreTrash()

> __purgeExpiredStoreTrash__(`ctx`, `owner?`): `Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

Defined in: src/providers/VersioningFileProvider.ts:3073

Expire the private tombstones past the retention window (#1459).

THE SPLIT (the same one #1457's link migration and #1458's index build
make): a background job holds no key, so the boot and hourly runs reach
the UNENCRYPTED stores only. A sealed store's trash expires in its owner's
own session, where the key is — `WikiRoutes.adoptSealedPages`, after an
unlock. A sealed store therefore keeps its tombstones until its owner next
signs in, which is the only moment anything can open them at all.

Returns what it purged so the caller can record it; the provider does not
decide how a purge is audited.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### owner?

`string`

#### Returns

`Promise`\<[`StoreDeletedEntry`](../../../types/Provider/interfaces/StoreDeletedEntry.md)[]\>

***

### purgeOldVersions()

> __purgeOldVersions__(`identifier`, `options?`): `Promise`\<\{ `dryRun`: `boolean`; `message`: `string`; `spaceFreed`: `number`; `versionsPurged`: `number`[]; `versionsRemoved`: `number`; \}\>

Defined in: src/providers/VersioningFileProvider.ts:3653

Purge old versions of a page

Removes old versions based on retention policies:

- Keep versions newer than retentionDays
- Keep last keepLatest versions (minimum)
- Optionally keep milestone versions (v1, every 10th version)

#### Parameters

##### identifier

`string`

Page UUID or title

##### options?

Purge options (keepLatest, retentionDays, keepMilestones, dryRun)

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

PurgeResult with versionsRemoved count, purged version numbers, dryRun flag, and message

#### Throws

If page not found or purge fails

#### Example

```ts
const result = await provider.purgeOldVersions('Main', { keepLatest: 20 });
console.log(`Removed ${result.versionsRemoved} versions`);
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`purgeOldVersions`](../../FileSystemProvider/classes/default.md#purgeoldversions)

***

### purgeStorePage()

> __purgeStorePage__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<`boolean`\>

Defined in: src/providers/VersioningFileProvider.ts:3032

purgeStorePageNow as the only write on the page (#2097, [withPageWrite](#withpagewrite)).

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

[`default`](../../FileSystemProvider/classes/default.md).[`putStoreDeleted`](../../FileSystemProvider/classes/default.md#putstoredeleted)

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

[`default`](../../FileSystemProvider/classes/default.md).[`putStorePage`](../../FileSystemProvider/classes/default.md#putstorepage)

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

[`default`](../../FileSystemProvider/classes/default.md).[`putStoreSearchDocument`](../../FileSystemProvider/classes/default.md#putstoresearchdocument)

***

### readablePrivateStores()

> __readablePrivateStores__(`owner`, `ctx`): `Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>\>

Defined in: src/providers/FileSystemProvider.ts:1309

One owner's stores as this context can read them, by store id (#1457).

`readableStoresOf` already drops a store whose index it cannot open, and
keeps a readable one that is empty — so a store missing here is one this
reader cannot say anything about, and an empty one is a store with no
page in it. [listPrivateStorePages](../../FileSystemProvider/classes/default.md#listprivatestorepages) is this, flattened.

#### Parameters

##### owner

`string`

Whose container

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Whose reading this is (#1179)

#### Returns

`Promise`\<`Map`\<`string`, [`PrivateStorePageRef`](../../../types/Provider/interfaces/PrivateStorePageRef.md)[]\>\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`readablePrivateStores`](../../FileSystemProvider/classes/default.md#readableprivatestores)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`readableStoresOf`](../../FileSystemProvider/classes/default.md#readablestoresof)

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

[`default`](../../FileSystemProvider/classes/default.md).[`readStoreDeleted`](../../FileSystemProvider/classes/default.md#readstoredeleted)

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

[`default`](../../FileSystemProvider/classes/default.md).[`readStorePages`](../../FileSystemProvider/classes/default.md#readstorepages)

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

[`default`](../../FileSystemProvider/classes/default.md).[`readStorePagesSync`](../../FileSystemProvider/classes/default.md#readstorepagessync)

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

[`default`](../../FileSystemProvider/classes/default.md).[`readStoreSearch`](../../FileSystemProvider/classes/default.md#readstoresearch)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`readStoreSearchDocuments`](../../FileSystemProvider/classes/default.md#readstoresearchdocuments)

***

### rebuildPageIndexFromDisk()

> __rebuildPageIndexFromDisk__(): `Promise`\<\{ `changed`: `number`; `historyInRequiredPages`: `number`; `keptUnscanned`: `number`; `pages`: `number`; `removed`: `string`[]; \}\>

Defined in: src/providers/VersioningFileProvider.ts:1406

Rewrite `page-index.json` from the pages on disk (#1374).

The index is otherwise only updated one entry at a time (save, delete,
restore, UUID rename) and rebuilt wholesale only when it is empty, so a
wrong entry — a stale location, a page whose file is gone — survived every
Reindex and Rebuild: both refresh the in-memory page list, and the next
restart's fast init read the old index again.

Call after `refreshPageList()`, whose disk scan this reads. Each scanned page
gets an entry whose location is where its file actually is: `private` (with
the owner from `private/<owner>/`) or `pages`. One exception, until the #1375
repair moves them: a page whose history is still only in the required-pages
folder keeps `required-pages`, so its history stays reachable (fast init
loads the live file regardless, #1371).

An entry is dropped only when its file is gone from disk; one whose file
exists but the scan skipped (a duplicate title or UUID) is kept as it was.
Deleted-page tombstones are untouched.

#### Returns

`Promise`\<\{ `changed`: `number`; `historyInRequiredPages`: `number`; `keptUnscanned`: `number`; `pages`: `number`; `removed`: `string`[]; \}\>

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`refreshPageList`](../../FileSystemProvider/classes/default.md#refreshpagelist)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`removeStoreSearchDocument`](../../FileSystemProvider/classes/default.md#removestoresearchdocument)

***

### renamePageInIndex()

> __renamePageInIndex__(`oldUuid`, `newUuid`): `Promise`\<`void`\>

Defined in: src/providers/VersioningFileProvider.ts:2004

Rename a UUID in the page index (used by adopt-UUID operations that move a file to a new UUID).
Updates the index entry key and uuid field, then persists the index.
No-op if oldUuid is not in the index.

#### Parameters

##### oldUuid

`string`

##### newUuid

`string`

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`resolvePrivatePageStore`](../../FileSystemProvider/classes/default.md#resolveprivatepagestore)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/VersioningFileProvider.ts:3830

Restore pages, then write their version histories back (#1380). A backup
made before #1380 has no history and restores pages only.

#### Parameters

##### backupData

`VersioningBackupData`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`restore`](../../FileSystemProvider/classes/default.md#restore)

***

### restoreDeletedPage()

> __restoreDeletedPage__(`uuid`): `Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `"error"` \| `"not-found"` \| `"title-conflict"` \| `"file-missing"` \| `"slug-conflict"`; \}\>

Defined in: src/providers/VersioningFileProvider.ts:2720

restoreDeletedPageNow as the only write on the page (#2097, [withPageWrite](#withpagewrite)).

#### Parameters

##### uuid

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; `title`: `string`; \} \| \{ `detail?`: `string`; `ok`: `false`; `reason`: `"error"` \| `"not-found"` \| `"title-conflict"` \| `"file-missing"` \| `"slug-conflict"`; \}\>

***

### restoreStorePage()

> __restoreStorePage__(`ctx`, `owner`, `store`, `uuid`): `Promise`\<[`StoreRestoreResult`](../../../types/Provider/type-aliases/StoreRestoreResult.md)\>

Defined in: src/providers/VersioningFileProvider.ts:2976

restoreStorePageNow as the only write on the page (#2097, [withPageWrite](#withpagewrite)).

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

`Promise`\<[`StoreRestoreResult`](../../../types/Provider/type-aliases/StoreRestoreResult.md)\>

***

### savePage()

> __savePage__(`pageName`, `content`, `metadata?`, `ctx`, `options?`): `Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

Defined in: src/providers/VersioningFileProvider.ts:2193

Override savePage to create versions

Algorithm:

1. Check if page exists (new vs update)
2. If update: create diff and new version
3. If new: create initial version (v1 with full content)
4. Update manifest.json
5. Call parent savePage() for current content
6. Update page-index.json

#### Parameters

##### pageName

`string`

Page title

##### content

`string`

New content

##### metadata?

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Page metadata

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### options?

[`PageSaveOptions`](../../../types/Page/interfaces/PageSaveOptions.md)

#### Returns

`Promise`\<[`SavedPage`](../../../types/Provider/interfaces/SavedPage.md)\>

Promise<void>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`savePage`](../../FileSystemProvider/classes/default.md#savepage)

***

### setIndexAddon()

> __setIndexAddon__(`uuid`, `addonName`): `Promise`\<`boolean`\>

Defined in: src/providers/VersioningFileProvider.ts:1127

Set the `addon` stamp on an existing index entry without rewriting the page.
Used by the boot-time back-fill so detection works on instances whose pages
were seeded before the field existed.

Returns true when the entry was found and changed.

#### Parameters

##### uuid

`string`

##### addonName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### shutdown()

> __shutdown__(): `void`

Defined in: src/providers/VersioningFileProvider.ts:2632

Shut down the provider. Its retention job is stopped by
BackgroundJobManager's shutdown handoff (#1721).

#### Returns

`void`

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`shutdown`](../../FileSystemProvider/classes/default.md#shutdown)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`skipVanished`](../../FileSystemProvider/classes/default.md#skipvanished)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`storeEntriesFor`](../../FileSystemProvider/classes/default.md#storeentriesfor)

***

### storeIdsOf()

> `protected` __storeIdsOf__(`owner`): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemProvider.ts:1289

The store ids in one owner's container (#1459), readable or not.

Unlike [readableStoresOf](../../FileSystemProvider/classes/default.md#readablestoresof), this does not open anything: a store with
no page in its index still has a trash, and a store this caller holds no
key for must still be VISITED so the caller can decide to skip it rather
than never see it.

#### Parameters

##### owner

`string`

#### Returns

`Promise`\<`string`[]\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`storeIdsOf`](../../FileSystemProvider/classes/default.md#storeidsof)

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

[`default`](../../FileSystemProvider/classes/default.md).[`storeSearchFile`](../../FileSystemProvider/classes/default.md#storesearchfile)

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

[`default`](../../FileSystemProvider/classes/default.md).[`storeSearchIndexExists`](../../FileSystemProvider/classes/default.md#storesearchindexexists)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`titleExistsForDifferentPage`](../../FileSystemProvider/classes/default.md#titleexistsfordifferentpage)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`updateStoreSearchDocument`](../../FileSystemProvider/classes/default.md#updatestoresearchdocument)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`userReference`](../../FileSystemProvider/classes/default.md#userreference)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`uuidExistsForDifferentPage`](../../FileSystemProvider/classes/default.md#uuidexistsfordifferentpage)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`uuidHoldingName`](../../FileSystemProvider/classes/default.md#uuidholdingname)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`withPageWrite`](../../FileSystemProvider/classes/default.md#withpagewrite)

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

[`default`](../../FileSystemProvider/classes/default.md).[`writeStoreDeleted`](../../FileSystemProvider/classes/default.md#writestoredeleted)

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

[`default`](../../FileSystemProvider/classes/default.md).[`writeStorePages`](../../FileSystemProvider/classes/default.md#writestorepages)

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

[`default`](../../FileSystemProvider/classes/default.md).[`writeStoreSearch`](../../FileSystemProvider/classes/default.md#writestoresearch)

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

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`writeStoreSearchDocuments`](../../FileSystemProvider/classes/default.md#writestoresearchdocuments)
