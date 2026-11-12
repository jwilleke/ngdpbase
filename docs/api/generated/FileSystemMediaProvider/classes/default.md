[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [FileSystemMediaProvider](../README.md) / default

# Class: default

Defined in: src/providers/FileSystemMediaProvider.ts:190

Filesystem-based media provider.

Scans configured folders, extracts metadata with ExifTool, and maintains a
persistent JSON index. Thumbnails are generated on demand via Sharp and cached
to thumbnailDir.

## Extends

- [`default`](../../BaseMediaProvider/classes/default.md)

## Constructors

### Constructor

> __new default__(`config`): `FileSystemMediaProvider`

Defined in: src/providers/FileSystemMediaProvider.ts:204

#### Parameters

##### config

[`FileSystemMediaProviderConfig`](../interfaces/FileSystemMediaProviderConfig.md)

#### Returns

`FileSystemMediaProvider`

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`constructor`](../../BaseMediaProvider/classes/default.md#constructor)

## Properties

### capabilities

> `readonly` __capabilities__: [`ProviderCapability`](../../types/Asset/type-aliases/ProviderCapability.md)[]

Defined in: src/providers/FileSystemMediaProvider.ts:194

Capabilities — override in subclasses.

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`capabilities`](../../BaseMediaProvider/classes/default.md#capabilities)

***

### displayName

> `readonly` __displayName__: `"Media Library"` = `'Media Library'`

Defined in: src/providers/FileSystemMediaProvider.ts:193

Human-readable display name — override in subclasses.

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`displayName`](../../BaseMediaProvider/classes/default.md#displayname)

***

### id

> `readonly` __id__: `"media-library"` = `'media-library'`

Defined in: src/providers/FileSystemMediaProvider.ts:192

Stable provider identifier — override in subclasses.

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`id`](../../BaseMediaProvider/classes/default.md#id)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`providerDescription`](../../BaseMediaProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`providerFeatures`](../../BaseMediaProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseMediaProvider/classes/default.md).[`providerName`](../../BaseMediaProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`providerVersion`](../../BaseMediaProvider/classes/default.md#providerversion)

## Methods

### buildMetadataWriteTags()

> `protected` `static` __buildMetadataWriteTags__(`patch`, `mimeType`): `Record`\<`string`, `unknown`\>

Defined in: src/providers/BaseMediaProvider.ts:299

Delegates to `utils/assetMetadataTags` (#999).

The mapping moved there so attachments and media share ONE implementation
— two copies of the #866 decisions (keywords-only, dual description tags,
CreateDate for A/V) would drift, and each of those is subtly wrong in a way
that is hard to notice.

Original contract, unchanged:
Map an AssetMetadataPatch onto the ExifTool tag names to write for a file
of the given MIME type. Pure — no I/O; unit-testable without ExifTool.

Tag choices mirror what processFile/extractCaptureDate READ back, so a
post-write re-extract round-trips every edited field:

- title            → Title (XMP-dc)
- description      → Description (XMP-dc) + ImageDescription (EXIF) —
                       the index reads `Description ?? ImageDescription`
- keywords         → Keywords only — ExifTool's MWG logic mirrors it to
                       XMP-dc Subject; writing both doubles the list
- dateTimeOriginal → DateTimeOriginal for images; CreateDate for
                       video/audio containers (QuickTime — see #750)

#### Parameters

##### patch

[`AssetMetadataPatch`](../../types/Asset/interfaces/AssetMetadataPatch.md)

##### mimeType

`string`

#### Returns

`Record`\<`string`, `unknown`\>

#### Throws

Error if `dateTimeOriginal` is present, non-null, and unparseable.

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`buildMetadataWriteTags`](../../BaseMediaProvider/classes/default.md#buildmetadatawritetags)

***

### delete()

> __delete__(`_id`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseMediaProvider.ts:604

AssetProvider.delete() — media providers are read-only; always returns false.

#### Parameters

##### \_id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`delete`](../../BaseMediaProvider/classes/default.md#delete)

***

### explainPath()

> __explainPath__(`target`): `Promise`\<[`MediaPathExplanation`](../../utils/explainMediaPath/interfaces/MediaPathExplanation.md)\>

Defined in: src/providers/FileSystemMediaProvider.ts:1172

Explain why one absolute path is, or is not, in the media index (#848).

# 814 reported media "often not discovered" and triage found zero indexing
bugs — every missing file was correctly skipped by a rule that leaves no
visible trace. This answers the question for a single path.

The rule ORDER lives in `explainMediaPath`, deliberately: the scanner
decides the same things inline as `continue` statements, which is fine for
scanning and useless for explaining. Keeping the classifier pure also lets
a future skipped-file report (#1056) reuse it instead of adding a third
copy of rules that already exist in two places.

Facts are gathered in two passes so the expensive ones are not paid for a
file that is already explained: index lookups are cheap, reading
`.ngdpbaseignore` files and EXIF is not. Only a path that survives every
cheap rule triggers the second pass.

#### Parameters

##### target

`string`

#### Returns

`Promise`\<[`MediaPathExplanation`](../../utils/explainMediaPath/interfaces/MediaPathExplanation.md)\>

***

### findByFilename()

> __findByFilename__(`filename`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/FileSystemMediaProvider.ts:634

Find the first item whose filename (basename) exactly matches.

Iterates the in-memory index; O(n) but the index is small enough that
this is acceptable for the ad-hoc `media://` URI resolution path.

#### Parameters

##### filename

`string`

Basename to match exactly (e.g. "IMG_1234.jpg").

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`findByFilename`](../../BaseMediaProvider/classes/default.md#findbyfilename)

***

### getAllKeywordCounts()

> __getAllKeywordCounts__(): `Promise`\<`Record`\<`string`, `number`\>\>

Defined in: src/providers/FileSystemMediaProvider.ts:591

# 895: distinct keywords across the media index with item counts. O(n)
over the in-memory index; scalar keyword values count as one-element
arrays (#545 shape tolerance).

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getAllKeywordCounts`](../../BaseMediaProvider/classes/default.md#getallkeywordcounts)

***

### getById()

> __getById__(`id`): `Promise`\<[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:580

AssetProvider.getById() — delegates to getItem().

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`getById`](../../BaseMediaProvider/classes/default.md#getbyid)

***

### getDurability()

> __getDurability__(): [`ProviderDurability`](../../providers/BaseProvider/interfaces/ProviderDurability.md) \| `null`

Defined in: src/providers/BaseProvider.ts:111

What this provider does with a record before it is durably stored.

Null means the provider has not stated it — silence rather than a default.
A provider that buffers and forgets to declare it must not inherit an
assertion that it writes immediately, which is precisely the bug this
contract replaces. A reporting layer renders null as "not stated", never
as "durable".

#### Returns

[`ProviderDurability`](../../providers/BaseProvider/interfaces/ProviderDurability.md) \| `null`

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`getDurability`](../../BaseMediaProvider/classes/default.md#getdurability)

***

### getItem()

> __getItem__(`id`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/FileSystemMediaProvider.ts:519

Retrieve a single item by id.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItem`](../../BaseMediaProvider/classes/default.md#getitem)

***

### getItemCount()

> __getItemCount__(): `Promise`\<`number`\>

Defined in: src/providers/FileSystemMediaProvider.ts:508

Every item with a year, in one pass over the index (#1741).

#### Returns

`Promise`\<`number`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItemCount`](../../BaseMediaProvider/classes/default.md#getitemcount)

***

### getItemsByDateRange()

> __getItemsByDateRange__(`after?`, `before?`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:540

Return all items whose capture timestamp falls in [after, before],
sorted ascending by capture date (#864 — Dawarich date-window queries).
Bounds are ISO-ish strings compared against `metadata.dateTimeOriginal`
("YYYY-MM-DD HH:MM:SS"); either bound may be omitted. Items without a
capture date are never returned.

#### Parameters

##### after?

`string`

##### before?

`string`

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItemsByDateRange`](../../BaseMediaProvider/classes/default.md#getitemsbydaterange)

***

### getItemsByKeyword()

> __getItemsByKeyword__(`keyword`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:573

Retrieve all media items whose EXIF/XMP keyword list contains the given keyword.

Performs an exact, case-sensitive match against each entry in
`metadata.keywords` (string or string[]). Items with no keywords are excluded.

#### Parameters

##### keyword

`string`

The keyword to match (e.g. "Molly's Cooking").

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Array of matching MediaItem objects (may be empty).

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItemsByKeyword`](../../BaseMediaProvider/classes/default.md#getitemsbykeyword)

***

### getItemsByPage()

> __getItemsByPage__(`pageName`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:560

Retrieve all items whose EXIF/XMP keywords include the page name — the
only association between a media item and a page (#1427).

#### Parameters

##### pageName

`string`

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItemsByPage`](../../BaseMediaProvider/classes/default.md#getitemsbypage)

***

### getItemsByYear()

> __getItemsByYear__(`year`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:526

Return all items for a given year, sorted by filename.

#### Parameters

##### year

`number`

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getItemsByYear`](../../BaseMediaProvider/classes/default.md#getitemsbyyear)

***

### getKeywordLeafPaths()

> __getKeywordLeafPaths__(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: src/providers/FileSystemMediaProvider.ts:612

# 917: library-wide leaf→path map built from every item's hierarchical
`keywordPaths`. Keys and values are canonical-value forms; a leaf with no
genuine hierarchy (only a root-level occurrence) is omitted. #918 uses this
to place a newly-added keyword at its known hierarchical home.

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getKeywordLeafPaths`](../../BaseMediaProvider/classes/default.md#getkeywordleafpaths)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseProvider.ts:93

Identify this provider.

Concrete providers may still override this — their name, version and
feature list are their own data, not duplication. What moved up here is
the SHAPE, so the nine copies of `ProviderInfo` become one, and so a new
provider that sets the fields gets a correct answer without writing the
method at all.

#### Returns

[`ProviderInfo`](../../types/Provider/interfaces/ProviderInfo.md)

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`getProviderInfo`](../../BaseMediaProvider/classes/default.md#getproviderinfo)

***

### getSkipReport()

> __getSkipReport__(): `Promise`\<[`MediaSkipReport`](../../utils/explainMediaPath/interfaces/MediaSkipReport.md) \| `null`\>

Defined in: src/providers/FileSystemMediaProvider.ts:1593

The skip report from the most recent scan, or null if none has been
written (fresh install, or no `indexFile` configured).

#### Returns

`Promise`\<[`MediaSkipReport`](../../utils/explainMediaPath/interfaces/MediaSkipReport.md) \| `null`\>

***

### getThumbnail()

> __getThumbnail__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:589

AssetProvider.getThumbnail() — delegates to getThumbnailBuffer().
Default size "300x300" when not specified.

#### Parameters

##### id

`string`

##### size

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`getThumbnail`](../../BaseMediaProvider/classes/default.md#getthumbnail)

***

### getThumbnailBuffer()

> __getThumbnailBuffer__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/providers/FileSystemMediaProvider.ts:749

Return a thumbnail buffer (webp) for the given item and size.

Thumbnails are cached on disk in config.thumbnailDir. Image items run
through Sharp directly. Video items (#722 Slice 1) have a poster frame
extracted via ffmpeg-static at the 1-second mark, then fed through the
same Sharp pipeline so the on-disk cache layout and `/media/thumb/:id`
endpoint are unchanged. Other item types (audio, docs) return null and
fall back to the generic icon in the asset-picker / media library.

#### Parameters

##### id

`string`

Item identifier.

##### size

`string`

Size string in the form "WxH" (e.g. "300x300").

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getThumbnailBuffer`](../../BaseMediaProvider/classes/default.md#getthumbnailbuffer)

***

### getYears()

> __getYears__(): `Promise`\<`number`[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:494

Return the list of years that have at least one item, sorted descending.

#### Returns

`Promise`\<`number`[]\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`getYears`](../../BaseMediaProvider/classes/default.md#getyears)

***

### healthCheck()

> __healthCheck__(): `Promise`\<`boolean`\>

Defined in: src/providers/FileSystemMediaProvider.ts:287

Verify that at least one configured media folder is accessible.

Returns false when every configured folder is unreachable — e.g. a NAS or
SLOW_STORAGE volume that has been unmounted or an SMB share that has dropped.
A partial failure (some folders gone, others present) still returns true so
the provider continues serving what it can; the warning log indicates which
folders are missing.

#### Returns

`Promise`\<`boolean`\>

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/FileSystemMediaProvider.ts:219

Load the persisted index from disk so queries work immediately
(before the first background scan).

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`initialize`](../../BaseMediaProvider/classes/default.md#initialize)

***

### ~~normalizeExifDate()~~

> `protected` `static` __normalizeExifDate__(`input`): `string`

Defined in: src/providers/BaseMediaProvider.ts:307

#### Parameters

##### input

`string`

#### Returns

`string`

#### Deprecated

Use `normalizeExifDate` from `utils/assetMetadataTags`.
Kept as a thin delegate so existing subclasses and tests keep working.

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`normalizeExifDate`](../../BaseMediaProvider/classes/default.md#normalizeexifdate)

***

### rebuild()

> __rebuild__(`onProgress?`): `Promise`\<[`ScanResult`](../../BaseMediaProvider/interfaces/ScanResult.md)\>

Defined in: src/providers/FileSystemMediaProvider.ts:327

Rebuild the media index from scratch.

Clears the in-memory index and deletes the persisted index file, then
runs a forced full scan so the result reflects only files currently on disk.

#### Parameters

##### onProgress?

(`processed`, `total`) => `void`

Optional callback invoked periodically with (processed, total).

#### Returns

`Promise`\<[`ScanResult`](../../BaseMediaProvider/interfaces/ScanResult.md)\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`rebuild`](../../BaseMediaProvider/classes/default.md#rebuild)

***

### scan()

> __scan__(`force?`, `onProgress?`): `Promise`\<[`ScanResult`](../../BaseMediaProvider/interfaces/ScanResult.md)\>

Defined in: src/providers/FileSystemMediaProvider.ts:352

Scan all configured folders, extract metadata for new/changed files,
save the updated index, and return a summary.

Phase 1: recursively collect all matching file paths (fast, no ExifTool).
Phase 2: process files concurrently in batches of BATCH_SIZE, calling
         ExifTool for each file that needs metadata extraction.

#### Parameters

##### force?

`boolean` = `false`

Re-process every file even if mtime is unchanged.

##### onProgress?

(`processed`, `total`) => `void`

Optional callback invoked after each batch with (processed, total).

#### Returns

`Promise`\<[`ScanResult`](../../BaseMediaProvider/interfaces/ScanResult.md)\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`scan`](../../BaseMediaProvider/classes/default.md#scan)

***

### search()

> __search__(`query`): `Promise`\<[`AssetPage`](../../types/Asset/interfaces/AssetPage.md)\>

Defined in: src/providers/BaseMediaProvider.ts:547

AssetProvider.search() — fans out to searchItems() and maps results.

#### Parameters

##### query

[`AssetQuery`](../../types/Asset/interfaces/AssetQuery.md)

#### Returns

`Promise`\<[`AssetPage`](../../types/Asset/interfaces/AssetPage.md)\>

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`search`](../../BaseMediaProvider/classes/default.md#search)

***

### searchItems()

> __searchItems__(`query`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:645

Full-text keyword search across filename, year, title,
description, and keywords fields.

All query tokens must match (AND semantics).

#### Parameters

##### query

`string`

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`searchItems`](../../BaseMediaProvider/classes/default.md#searchitems)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/providers/FileSystemMediaProvider.ts:273

Release the ExifTool worker process.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`shutdown`](../../BaseMediaProvider/classes/default.md#shutdown)

***

### store()

> __store__(`_buffer`, `_info`): `Promise`\<[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)\>

Defined in: src/providers/BaseMediaProvider.ts:597

AssetProvider.store() — media providers are read-only; always throws.
Declared to satisfy the interface typing; runtime guard via capabilities check.

#### Parameters

##### \_buffer

`Buffer`

##### \_info

[`AssetInput`](../../types/Asset/interfaces/AssetInput.md)

#### Returns

`Promise`\<[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)\>

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`store`](../../BaseMediaProvider/classes/default.md#store)

***

### toAssetRecord()

> `protected` __toAssetRecord__(`item`): [`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)

Defined in: src/providers/BaseMediaProvider.ts:455

Convert a MediaItem to a unified AssetRecord.
Subclasses may override for provider-specific URL schemes.

#### Parameters

##### item

[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)

#### Returns

[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`toAssetRecord`](../../BaseMediaProvider/classes/default.md#toassetrecord)

***

### toCreativeWork()

> __toCreativeWork__(`item`): [`CreativeWork`](../../types/Schema/type-aliases/CreativeWork.md)

Defined in: src/providers/BaseMediaProvider.ts:348

Convert a MediaItem to a schema.org-shaped CreativeWork (Slice 3 of #755).

Discriminated by MIME prefix:

- image/* → ImageObject
- video/* → VideoObject
- audio/* → AudioObject
- anything else → ImageObject (best-effort; callers should filter
    by mime upstream if they only want media subtypes)

Internal consumers read AssetRecord (see `toAssetRecord` below);
this method produces the canonical shape for JSON-LD render (Slice 6)
and for CatalogSource.get() / list() fan-out from CatalogManager.
Subclasses may override for provider-specific URL schemes.

Public so MediaManager (the registered `CatalogSource`) can call it
without exposing `toAssetRecord`'s internal projection.

#### Parameters

##### item

[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md)

#### Returns

[`CreativeWork`](../../types/Schema/type-aliases/CreativeWork.md)

#### Inherited from

[`default`](../../BaseMediaProvider/classes/default.md).[`toCreativeWork`](../../BaseMediaProvider/classes/default.md#tocreativework)

***

### unreachableFolders()

> __unreachableFolders__(): `Promise`\<`string`[]\>

Defined in: src/providers/FileSystemMediaProvider.ts:307

The configured folders this process cannot read (#1167): missing, unmounted
or without read permission. Read-only — it never touches the files.

#### Returns

`Promise`\<`string`[]\>

***

### updateItemMetadata()

> __updateItemMetadata__(`id`, `patch`): `Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/FileSystemMediaProvider.ts:686

Write a metadata patch into the source file (and its alternate-format
siblings, so e.g. a HEIC+JPG pair stays in sync), then refresh the index
entry by re-reading the file — the index always reflects what is actually
on disk, not what we intended to write.

ExifTool's default backup behaviour is kept deliberately: the first write
to a file leaves a `<name>_original` sibling. Those extensions are not in
the indexable set, so scans ignore them.

The re-extract records the file's new mtime, so the next scheduled scan
sees an unchanged file and skips it (no churn). `alternates` is
re-attached afterwards because processFile builds entries without it.

#### Parameters

##### id

`string`

##### patch

[`AssetMetadataPatch`](../../types/Asset/interfaces/AssetMetadataPatch.md)

#### Returns

`Promise`\<[`MediaItem`](../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

#### Overrides

[`default`](../../BaseMediaProvider/classes/default.md).[`updateItemMetadata`](../../BaseMediaProvider/classes/default.md#updateitemmetadata)
