[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [BaseMediaProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseMediaProvider.ts:102

Abstract base class for media providers.

Implement this class to add support for a new media storage backend
(filesystem, S3, etc.). MediaManager always interacts through this interface.

## Extends

- [`default`](../../providers/BaseProvider/classes/default.md)

## Extended by

- [`default`](../../FileSystemMediaProvider/classes/default.md)

## Implements

- [`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md)

## Constructors

### Constructor

> __new default__(): `BaseMediaProvider`

#### Returns

`BaseMediaProvider`

#### Inherited from

[`default`](../../providers/BaseProvider/classes/default.md).[`constructor`](../../providers/BaseProvider/classes/default.md#constructor)

## Properties

### capabilities

> `abstract` `readonly` __capabilities__: [`ProviderCapability`](../../types/Asset/type-aliases/ProviderCapability.md)[]

Defined in: src/providers/BaseMediaProvider.ts:328

Capabilities — override in subclasses.

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`capabilities`](../../types/Asset/interfaces/AssetProvider.md#capabilities)

***

### displayName

> `abstract` `readonly` __displayName__: `string`

Defined in: src/providers/BaseMediaProvider.ts:325

Human-readable display name — override in subclasses.

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`displayName`](../../types/Asset/interfaces/AssetProvider.md#displayname)

***

### id

> `abstract` `readonly` __id__: `string`

Defined in: src/providers/BaseMediaProvider.ts:322

Stable provider identifier — override in subclasses.

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`id`](../../types/Asset/interfaces/AssetProvider.md#id)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../providers/BaseProvider/classes/default.md).[`providerDescription`](../../providers/BaseProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../providers/BaseProvider/classes/default.md).[`providerFeatures`](../../providers/BaseProvider/classes/default.md#providerfeatures)

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

[`default`](../../providers/BaseProvider/classes/default.md).[`providerName`](../../providers/BaseProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../providers/BaseProvider/classes/default.md).[`providerVersion`](../../providers/BaseProvider/classes/default.md#providerversion)

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

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`delete`](../../types/Asset/interfaces/AssetProvider.md#delete)

***

### findByFilename()

> __findByFilename__(`_filename`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:148

Find the first media item whose filename (basename) exactly matches.

Used by the `media://` URI scheme so authors can reference items by
their original filename rather than an opaque SHA-256 id.

Default implementation returns null; override in providers that maintain
a filename-keyed index.

#### Parameters

##### \_filename

`string`

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

The first matching MediaItem, or null if not found.

***

### getAllKeywordCounts()

> __getAllKeywordCounts__(): `Promise`\<`Record`\<`string`, `number`\>\>

Defined in: src/providers/BaseMediaProvider.ts:219

# 895: all distinct EXIF/XMP keywords in the media index with item counts.
Used by the admin keyword drift report (observed-media side). Default
implementation returns an empty map; override in providers with an index.

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>

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

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`getById`](../../types/Asset/interfaces/AssetProvider.md#getbyid)

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

[`default`](../../providers/BaseProvider/classes/default.md).[`getDurability`](../../providers/BaseProvider/classes/default.md#getdurability)

***

### getItem()

> `abstract` __getItem__(`id`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:134

Retrieve a single media item by its unique identifier.

#### Parameters

##### id

`string`

The item identifier.

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

The MediaItem, or null if not found.

***

### getItemCount()

> __getItemCount__(): `Promise`\<`number`\>

Defined in: src/providers/BaseMediaProvider.ts:166

How many items [getYears](#getyears) and [getItemsByYear](#getitemsbyyear) cover — every
item with a year (#1741). The default asks year by year, which is correct
for any provider; override it where the count is one pass, because an
index with many years makes the default a pass per year.

#### Returns

`Promise`\<`number`\>

***

### getItemsByDateRange()

> __getItemsByDateRange__(`_after?`, `_before?`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Defined in: src/providers/BaseMediaProvider.ts:178

Return items whose capture timestamp falls within [after, before], sorted
ascending by capture date (#864). Either bound may be omitted. Items with
no capture date are excluded. Default implementation returns [] so
providers without date support degrade gracefully.

#### Parameters

##### \_after?

`string`

##### \_before?

`string`

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

***

### getItemsByKeyword()

> __getItemsByKeyword__(`_keyword`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Defined in: src/providers/BaseMediaProvider.ts:210

Retrieve all media items whose EXIF/XMP keyword list contains the given keyword.

Performs an exact, case-sensitive match against each entry in
`metadata.keywords` (string or string[]). Items with no keywords are excluded.

#### Parameters

##### \_keyword

`string`

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Array of matching MediaItem objects (may be empty).

***

### getItemsByPage()

> __getItemsByPage__(`_pageName`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Defined in: src/providers/BaseMediaProvider.ts:197

Retrieve all media items whose EXIF/XMP keywords name a wiki page.

#### Parameters

##### \_pageName

`string`

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Array of matching MediaItem objects (may be empty).

***

### getItemsByYear()

> `abstract` __getItemsByYear__(`year`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Defined in: src/providers/BaseMediaProvider.ts:158

Retrieve all media items for a given year.

#### Parameters

##### year

`number`

Four-digit year (e.g. 2024).

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Array of matching MediaItem objects (may be empty).

***

### getKeywordLeafPaths()

> __getKeywordLeafPaths__(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: src/providers/BaseMediaProvider.ts:227

# 917: leaf→path map from hierarchical keyword tags. Default empty; overridden
in providers that index `keywordPaths`.

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

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

[`default`](../../providers/BaseProvider/classes/default.md).[`getProviderInfo`](../../providers/BaseProvider/classes/default.md#getproviderinfo)

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

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`getThumbnail`](../../types/Asset/interfaces/AssetProvider.md#getthumbnail)

***

### getThumbnailBuffer()

> `abstract` __getThumbnailBuffer__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:189

Generate (or retrieve cached) thumbnail data for an item.

#### Parameters

##### id

`string`

The item identifier.

##### size

`string`

Requested size string (e.g. "300x300").

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

JPEG buffer, or null if thumbnail cannot be generated.

***

### getYears()

> `abstract` __getYears__(): `Promise`\<`number`[]\>

Defined in: src/providers/BaseMediaProvider.ts:126

Return the list of years that have at least one media item, sorted
descending (most recent first).

#### Returns

`Promise`\<`number`[]\>

Array of four-digit years.

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BaseMediaProvider.ts:107

Lifecycle method called once after construction to load persisted state.
Default implementation is a no-op; override to load an index from disk.

#### Returns

`Promise`\<`void`\>

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

***

### rebuild()

> __rebuild__(`onProgress?`): `Promise`\<[`ScanResult`](../interfaces/ScanResult.md)\>

Defined in: src/providers/BaseMediaProvider.ts:239

Rebuild the media index from scratch, discarding all existing entries.

Default implementation returns an empty ScanResult; override in providers
that maintain a persistent index.

#### Parameters

##### onProgress?

(`processed`, `total`) => `void`

Optional callback invoked periodically with (processed, total).

#### Returns

`Promise`\<[`ScanResult`](../interfaces/ScanResult.md)\>

***

### scan()

> `abstract` __scan__(`force?`, `onProgress?`): `Promise`\<[`ScanResult`](../interfaces/ScanResult.md)\>

Defined in: src/providers/BaseMediaProvider.ts:118

Scan configured media folders and update the in-memory/persisted index.

#### Parameters

##### force?

`boolean`

When true, re-scan all files even if mtime is unchanged.

##### onProgress?

(`processed`, `total`) => `void`

Optional callback invoked periodically with (processed, total).

#### Returns

`Promise`\<[`ScanResult`](../interfaces/ScanResult.md)\>

Summary of what was scanned/added/updated/errored.

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

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`search`](../../types/Asset/interfaces/AssetProvider.md#search)

***

### searchItems()

> `abstract` __searchItems__(`query`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Defined in: src/providers/BaseMediaProvider.ts:253

Full-text / keyword search across the media index.

Renamed from `search` to avoid collision with the AssetProvider interface.
MediaManager and all callers use this method name.

#### Parameters

##### query

`string`

Search query string.

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md)[]\>

Array of matching MediaItem objects (may be empty).

***

### shutdown()

> `abstract` __shutdown__(): `Promise`\<`void`\>

Defined in: src/providers/BaseMediaProvider.ts:315

Release any resources held by the provider (open file handles, worker
processes, etc.).

#### Returns

`Promise`\<`void`\>

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

#### Implementation of

[`AssetProvider`](../../types/Asset/interfaces/AssetProvider.md).[`store`](../../types/Asset/interfaces/AssetProvider.md#store)

***

### toAssetRecord()

> `protected` __toAssetRecord__(`item`): [`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)

Defined in: src/providers/BaseMediaProvider.ts:455

Convert a MediaItem to a unified AssetRecord.
Subclasses may override for provider-specific URL schemes.

#### Parameters

##### item

[`MediaItem`](../interfaces/MediaItem.md)

#### Returns

[`AssetRecord`](../../types/Asset/interfaces/AssetRecord.md)

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

[`MediaItem`](../interfaces/MediaItem.md)

#### Returns

[`CreativeWork`](../../types/Schema/type-aliases/CreativeWork.md)

***

### updateItemMetadata()

> __updateItemMetadata__(`_id`, `_patch`): `Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

Defined in: src/providers/BaseMediaProvider.ts:271

Write user-editable descriptive metadata into the source file and refresh
the index entry. Only meaningful when 'edit' is in `capabilities`.

Named `updateItemMetadata` (returning MediaItem) to avoid a return-type
collision with AssetProvider.updateMetadata (returning AssetRecord) —
same pattern as searchItems vs search.

Default implementation rejects; override in providers that support writes.

#### Parameters

##### \_id

`string`

##### \_patch

[`AssetMetadataPatch`](../../types/Asset/interfaces/AssetMetadataPatch.md)

#### Returns

`Promise`\<[`MediaItem`](../interfaces/MediaItem.md) \| `null`\>

The refreshed MediaItem, or null if the id is unknown (or the
         edit caused the item to leave the index, e.g. an
         `ngdpbaseignore` keyword).
