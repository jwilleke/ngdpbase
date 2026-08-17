[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/VersioningFileProvider](../README.md) / default

# Class: default

Defined in: [src/providers/VersioningFileProvider.ts:120](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L120)

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

Defined in: [src/providers/VersioningFileProvider.ts:154](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L154)

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

### encoding

> `protected` __encoding__: `BufferEncoding`

Defined in: [src/providers/FileSystemProvider.ts:81](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L81)

File encoding

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`encoding`](../../FileSystemProvider/classes/default.md#encoding)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../BasePageProvider/interfaces/WikiEngine.md)

Defined in: [src/providers/BasePageProvider.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`engine`](../../FileSystemProvider/classes/default.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BasePageProvider.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L57)

Whether provider has been initialized

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`initialized`](../../FileSystemProvider/classes/default.md#initialized)

***

### installationComplete

> __installationComplete__: `boolean`

Defined in: [src/providers/FileSystemProvider.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L99)

Whether installation is complete (required-pages should not be used after install)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`installationComplete`](../../FileSystemProvider/classes/default.md#installationcomplete)

***

### pageCache

> `protected` __pageCache__: `Map`\<`string`, `PageCacheInfo`\>

Defined in: [src/providers/FileSystemProvider.ts:84](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L84)

Main page cache (keyed by title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageCache`](../../FileSystemProvider/classes/default.md#pagecache)

***

### pageNameMatcher

> `protected` __pageNameMatcher__: [`default`](../../../utils/PageNameMatcher/classes/default.md) \| `null`

Defined in: [src/providers/FileSystemProvider.ts:96](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L96)

Page name matcher for fuzzy/plural matching

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageNameMatcher`](../../FileSystemProvider/classes/default.md#pagenamematcher)

***

### pagesDirectory

> `protected` __pagesDirectory__: `string` \| `null`

Defined in: [src/providers/FileSystemProvider.ts:75](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L75)

Path to regular pages directory

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pagesDirectory`](../../FileSystemProvider/classes/default.md#pagesdirectory)

***

### requiredPagesDirectory

> `protected` __requiredPagesDirectory__: `string` \| `null`

Defined in: [src/providers/FileSystemProvider.ts:78](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L78)

Path to required pages directory

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`requiredPagesDirectory`](../../FileSystemProvider/classes/default.md#requiredpagesdirectory)

***

### slugIndex

> `protected` __slugIndex__: `Map`\<`string`, `string`\>

Defined in: [src/providers/FileSystemProvider.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L93)

Slug index (slug -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`slugIndex`](../../FileSystemProvider/classes/default.md#slugindex)

***

### titleIndex

> `protected` __titleIndex__: `Map`\<`string`, `string`\>

Defined in: [src/providers/FileSystemProvider.ts:87](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L87)

Title index (lowercase title -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`titleIndex`](../../FileSystemProvider/classes/default.md#titleindex)

***

### uuidIndex

> `protected` __uuidIndex__: `Map`\<`string`, `string`\>

Defined in: [src/providers/FileSystemProvider.ts:90](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L90)

UUID index (UUID -> canonical title)

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`uuidIndex`](../../FileSystemProvider/classes/default.md#uuidindex)

## Methods

### backup()

> __backup__(): `Promise`\<`BackupData`\>

Defined in: [src/providers/FileSystemProvider.ts:577](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L577)

Backup all pages to a serializable format

Returns all page files with their content and relative paths.
This allows the backup to be restored to different directory locations.

#### Returns

`Promise`\<`BackupData`\>

Backup data containing all pages

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`backup`](../../FileSystemProvider/classes/default.md#backup)

***

### compareVersions()

> __compareVersions__(`identifier`, `v1`, `v2`): `Promise`\<[`VersionDiff`](../../../types/Version/interfaces/VersionDiff.md)\>

Defined in: [src/providers/VersioningFileProvider.ts:1256](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1256)

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

### deletePage()

> __deletePage__(`identifier`): `Promise`\<`boolean`\>

Defined in: [src/providers/VersioningFileProvider.ts:725](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L725)

Delete a page and its version history

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`deletePage`](../../FileSystemProvider/classes/default.md#deletepage)

***

### findPage()

> __findPage__(`identifier`): `string` \| `null`

Defined in: [src/providers/FileSystemProvider.ts:545](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L545)

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

### getAllPageInfo()

> __getAllPageInfo__(`_options?`): `Promise`\<[`PageInfo`](../../../types/Page/interfaces/PageInfo.md)[]\>

Defined in: [src/providers/FileSystemProvider.ts:528](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L528)

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

### getAllPages()

> __getAllPages__(): `Promise`\<`string`[]\>

Defined in: [src/providers/FileSystemProvider.ts:519](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L519)

Returns a list of all available page titles (sorted)

#### Returns

`Promise`\<`string`[]\>

An array of page titles

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getAllPages`](../../FileSystemProvider/classes/default.md#getallpages)

***

### getPage()

> __getPage__(`identifier`): `Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

Defined in: [src/providers/FileSystemProvider.ts:333](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L333)

Get page content and metadata together

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<[`WikiPage`](../../../types/Page/interfaces/WikiPage.md) \| `null`\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPage`](../../FileSystemProvider/classes/default.md#getpage)

***

### getPageContent()

> __getPageContent__(`identifier`): `Promise`\<`string`\>

Defined in: [src/providers/FileSystemProvider.ts:362](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L362)

Retrieves the raw markdown content of a page (without frontmatter).

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`string`\>

The raw markdown content without frontmatter

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageContent`](../../FileSystemProvider/classes/default.md#getpagecontent)

***

### getPageMetadata()

> __getPageMetadata__(`identifier`): `Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

Defined in: [src/providers/FileSystemProvider.ts:379](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L379)

Retrieves the metadata (frontmatter) for a given page.

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null`\>

The page metadata, or null if not found

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`getPageMetadata`](../../FileSystemProvider/classes/default.md#getpagemetadata)

***

### getPageVersion()

> __getPageVersion__(`identifier`, `version`): `Promise`\<[`VersionContent`](../../../types/Version/interfaces/VersionContent.md)\>

Defined in: [src/providers/VersioningFileProvider.ts:1125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1125)

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

> __getProviderInfo__(): [`ProviderInfo`](../../BasePageProvider/interfaces/ProviderInfo.md)

Defined in: [src/providers/VersioningFileProvider.ts:1385](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1385)

Get provider information

#### Returns

[`ProviderInfo`](../../BasePageProvider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`getProviderInfo`](../../FileSystemProvider/classes/default.md#getproviderinfo)

***

### getVersionHistory()

> __getVersionHistory__(`identifier`, `limit?`): `Promise`\<[`VersionHistoryEntry`](../../../types/Version/interfaces/VersionHistoryEntry.md)[]\>

Defined in: [src/providers/VersioningFileProvider.ts:1074](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1074)

Get version history for a page

Returns an array of version metadata sorted by version number (newest first).
Each entry includes: version, dateCreated, editor, changeType, comment, contentHash, contentSize.

#### Parameters

##### identifier

`string`

Page UUID or title

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

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/VersioningFileProvider.ts:187](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L187)

Initialize the versioning provider

1. Calls parent FileSystemProvider.initialize()
2. Loads versioning configuration
3. Creates version directories
4. Loads or creates page-index.json

#### Returns

`Promise`\<`void`\>

Promise<void>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`initialize`](../../FileSystemProvider/classes/default.md#initialize)

***

### pageExists()

> __pageExists__(`identifier`): `boolean`

Defined in: [src/providers/FileSystemProvider.ts:511](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L511)

Check if a page exists

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`boolean`

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`pageExists`](../../FileSystemProvider/classes/default.md#pageexists)

***

### purgeOldVersions()

> __purgeOldVersions__(`identifier`, `keepLatest`): `Promise`\<`number`\>

Defined in: [src/providers/VersioningFileProvider.ts:1303](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1303)

Purge old versions of a page

Removes old versions based on retention policies:

- Keep versions newer than retentionDays
- Keep last keepLatest versions (minimum)
- Optionally keep milestone versions (v1, every 10th version)

#### Parameters

##### identifier

`string`

Page UUID or title

##### keepLatest

`number`

Minimum number of recent versions to keep

#### Returns

`Promise`\<`number`\>

Number of versions purged

#### Throws

If page not found or purge fails

#### Example

```ts
const count = await provider.purgeOldVersions('Main', 20);
console.log(`Removed ${count} versions`);
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`purgeOldVersions`](../../FileSystemProvider/classes/default.md#purgeoldversions)

***

### refreshPageList()

> __refreshPageList__(): `Promise`\<`void`\>

Defined in: [src/providers/FileSystemProvider.ts:188](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L188)

Reads all .md files from the pages directory (and required-pages during installation)
and populates the page cache with multiple indexes.

After installation is complete, only pages from the main pages directory are loaded.
The required-pages directory is only used during installation to seed the wiki.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`refreshPageList`](../../FileSystemProvider/classes/default.md#refreshpagelist)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/providers/FileSystemProvider.ts:660](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/FileSystemProvider.ts#L660)

Restore pages from backup data

Recreates all page files from the backup data.
Preserves directory structure and file content.

#### Parameters

##### backupData

`BackupData`

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`restore`](../../FileSystemProvider/classes/default.md#restore)

***

### restoreVersion()

> __restoreVersion__(`identifier`, `version`): `Promise`\<`void`\>

Defined in: [src/providers/VersioningFileProvider.ts:1203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L1203)

Restore page to a specific version

Creates a new version with the content from the specified version.
This does NOT delete newer versions - it creates a new version with old content.

#### Parameters

##### identifier

`string`

Page UUID or title

##### version

`number`

Version number to restore to

#### Returns

`Promise`\<`void`\>

#### Throws

If page/version not found or restore fails

#### Example

```ts
await provider.restoreVersion('Main', 5);
console.log(`Restored to v5`);
```

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`restoreVersion`](../../FileSystemProvider/classes/default.md#restoreversion)

***

### savePage()

> __savePage__(`pageName`, `content`, `metadata`): `Promise`\<`void`\>

Defined in: [src/providers/VersioningFileProvider.ts:655](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/VersioningFileProvider.ts#L655)

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

##### metadata

`Partial`\<[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)\> = `{}`

Page metadata

#### Returns

`Promise`\<`void`\>

Promise<void>

#### Overrides

[`default`](../../FileSystemProvider/classes/default.md).[`savePage`](../../FileSystemProvider/classes/default.md#savepage)

***

### shutdown()

> __shutdown__(): `void`

Defined in: [src/providers/BasePageProvider.ts:299](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasePageProvider.ts#L299)

Shutdown the provider (cleanup resources)

#### Returns

`void`

#### Inherited from

[`default`](../../FileSystemProvider/classes/default.md).[`shutdown`](../../FileSystemProvider/classes/default.md#shutdown)
