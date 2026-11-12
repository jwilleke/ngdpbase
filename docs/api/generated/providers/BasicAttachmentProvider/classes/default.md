[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BasicAttachmentProvider](../README.md) / default

# Class: default

Defined in: src/providers/BasicAttachmentProvider.ts:243

BasicAttachmentProvider - Filesystem-based attachment storage

Implements attachment storage using filesystem with Schema.org CreativeWork metadata.
Attachments are stored in a shared directory structure, not tied to individual pages.
Page references are tracked via the "mentions" array in metadata.

Based on JSPWiki's BasicAttachmentProvider:
<https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/providers/BasicAttachmentProvider.java>

Features:

- Filesystem storage with SHA-256 content hashing
- Schema.org CreativeWork metadata format
- Shared storage model with page mentions tracking
- Automatic metadata persistence
- Backup/restore support

## Extends

- [`default`](../../BaseAttachmentProvider/classes/default.md)

## Implements

- [`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `BasicAttachmentProvider`

Defined in: src/providers/BasicAttachmentProvider.ts:283

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`BasicAttachmentProvider`

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`constructor`](../../BaseAttachmentProvider/classes/default.md#constructor)

## Properties

### capabilities

> `readonly` __capabilities__: [`ProviderCapability`](../../../types/Asset/type-aliases/ProviderCapability.md)[]

Defined in: src/providers/BasicAttachmentProvider.ts:1865

Capabilities this provider supports

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`capabilities`](../../../types/Asset/interfaces/AssetProvider.md#capabilities)

***

### displayName

> `readonly` __displayName__: `"Local Attachments"` = `'Local Attachments'`

Defined in: src/providers/BasicAttachmentProvider.ts:1864

Human-readable display name

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`displayName`](../../../types/Asset/interfaces/AssetProvider.md#displayname)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseAttachmentProvider.ts:65

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`engine`](../../BaseAttachmentProvider/classes/default.md#engine)

***

### id

> `readonly` __id__: `"local"` = `'local'`

Defined in: src/providers/BasicAttachmentProvider.ts:1863

Stable provider identifier (e.g. 'local', 'media-library', 's3')

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`id`](../../../types/Asset/interfaces/AssetProvider.md#id)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseAttachmentProvider.ts:68

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`initialized`](../../BaseAttachmentProvider/classes/default.md#initialized)

***

### providerDescription?

> `protected` `optional` __providerDescription?__: `string`

Defined in: src/providers/BaseProvider.ts:79

One line on what it does. Optional, as on the canonical type.

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`providerDescription`](../../BaseAttachmentProvider/classes/default.md#providerdescription)

***

### providerFeatures?

> `protected` `optional` __providerFeatures?__: `string`[]

Defined in: src/providers/BaseProvider.ts:82

Capability strings a manager may log or branch on.

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`providerFeatures`](../../BaseAttachmentProvider/classes/default.md#providerfeatures)

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

[`default`](../../BaseAttachmentProvider/classes/default.md).[`providerName`](../../BaseAttachmentProvider/classes/default.md#providername)

***

### providerVersion?

> `protected` `optional` __providerVersion?__: `string`

Defined in: src/providers/BaseProvider.ts:76

Version this provider reports. Defaults to `1.0.0` when unset.

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`providerVersion`](../../BaseAttachmentProvider/classes/default.md#providerversion)

## Methods

### adoptRecordIntoStore()

> __adoptRecordIntoStore__(`location`, `id`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1159

Move one record out of the global `attachment-metadata.json` and into its
store's own index (#1460), bytes and all.

The file KEEPS the name it has: renaming it would break nothing that is
written down, but it would rewrite a file for no reason, and a store is
meant to be a directory an operator can read. The entry keeps the record's
identifier too — that id is the `/attachments/{id}` URL on every page that
references the file.

Idempotent: a record already gone from the map, or a store that already
lists the id, is a no-op that answers `null`. The move itself is skipped
when the bytes are already in place.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

the store entry it wrote, or null when there was nothing to move

***

### attachmentExists()

> __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1523

Check if attachment exists

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

True if exists

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`attachmentExists`](../../BaseAttachmentProvider/classes/default.md#attachmentexists)

***

### backfillDocMetadata()

> __backfillDocMetadata__(`onProgress?`): `Promise`\<\{ `errors`: `number`; `scanned`: `number`; `skipped`: `number`; `updated`: `number`; \}\>

Defined in: src/providers/BasicAttachmentProvider.ts:1985

Slice 5b of #760 (#763) — walk every stored attachment and re-extract
embedded document metadata for the supported doc MIMEs. Backfills the
seven Slice-5 fields (documentTitle / documentAuthor / documentSubject /
documentKeywords / documentDateCreated / documentDateModified /
inLanguage) on pre-v3.27.0 records that never went through the
Slice-5 extraction path at upload time.

Per-file failures are non-fatal (logged + counted) — mirrors the
existing `extractDocMetadata` contract where uploads succeed even when
exiftool trips. Non-document MIMEs are skipped without modification.
Returns a summary suitable for the background-job report.

#### Parameters

##### onProgress?

(`processed`, `total`) => `void`

#### Returns

`Promise`\<\{ `errors`: `number`; `scanned`: `number`; `skipped`: `number`; `updated`: `number`; \}\>

***

### backup()

> __backup__(): `Promise`\<`BackupData`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1784

Backup provider data

#### Returns

`Promise`\<`BackupData`\>

Backup data

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`backup`](../../BaseAttachmentProvider/classes/default.md#backup)

***

### backupFiles()

> __backupFiles__(`archive`): `Promise`\<[`AttachmentFilesBackupOutcome`](../../attachmentFilesBackup/interfaces/AttachmentFilesBackupOutcome.md)\>

Defined in: src/providers/BasicAttachmentProvider.ts:1805

The files themselves, beside the backup document (#1876): the shared pool and every vault's, as stored.

#### Parameters

##### archive

(`part`) => [`BackupArchiveTarget`](../../../managers/BaseManager/interfaces/BackupArchiveTarget.md)

#### Returns

`Promise`\<[`AttachmentFilesBackupOutcome`](../../attachmentFilesBackup/interfaces/AttachmentFilesBackupOutcome.md)\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`backupFiles`](../../BaseAttachmentProvider/classes/default.md#backupfiles)

***

### convertPoolReferences()

> __convertPoolReferences__(`convert`): `Promise`\<`number`\>

Defined in: src/providers/BasicAttachmentProvider.ts:587

The shared pool's uploaders and editors (#2097): each record's
`author.name` and `editor.name` become what `convert` answers (the
identity @id), and the metadata file is written once when anything
changed. `convert` may throw (the identity store cannot answer); then
nothing is written. Returns how many values changed.

#### Parameters

##### convert

(`stored`) => `Promise`\<`string`\>

#### Returns

`Promise`\<`number`\>

***

### convertStoreReferences()

> __convertStoreReferences__(`location`, `convert`): `Promise`\<`number`\>

Defined in: src/providers/BasicAttachmentProvider.ts:609

One vault's uploaders (#2097): each entry's `author` in the vault's own
files index, through the vault's I/O. Written once when anything
changed; nothing when `convert` throws. Returns how many values changed.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### convert

(`stored`) => `Promise`\<`string`\>

#### Returns

`Promise`\<`number`\>

***

### copyRecordIntoStore()

> __copyRecordIntoStore__(`location`, `id`, `pageName`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1279

Copy a shared-pool file into a store under the same id, mentioned by
`pageName` there. The shared record is left as it is. A store that already
lists the id just gains the mention.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

##### pageName

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

the store entry, or null when the pool has no such file

***

### copyStoreFileToPool()

> __copyStoreFileToPool__(`from`, `id`, `pageName`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1347

Copy a store's file into the shared pool under the same id, opened, and
mentioned by `pageName` (a public page). A pool that already holds the id
just gains the mention.

#### Parameters

##### from

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

##### pageName

`string`

#### Returns

`Promise`\<`boolean`\>

true when the pool holds the file afterwards

***

### copyStoreFileToStore()

> __copyStoreFileToStore__(`from`, `to`, `id`, `pageName`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1322

Copy a store's file into another store under the same id, mentioned by
`pageName` there. A destination that already lists the id just gains the
mention.

#### Parameters

##### from

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### to

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

##### pageName

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

the destination's entry, or null when the source does not list it

***

### delete()

> __delete__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:2418

AssetProvider.delete() — delegates to deleteAttachment().

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`delete`](../../../types/Asset/interfaces/AssetProvider.md#delete)

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1495

Delete an attachment

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`deleteAttachment`](../../BaseAttachmentProvider/classes/default.md#deleteattachment)

***

### deleteFileInStore()

> __deleteFileInStore__(`location`, `id`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1251

Delete a file from a store: its bytes and its index entry. Null when the store does not list it.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`deleteFileInStore`](../../BaseAttachmentProvider/classes/default.md#deletefileinstore)

***

### deletePageAttachments()

> __deletePageAttachments__(`pageUuid`): `Promise`\<`number`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1654

Delete all attachments for a page

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<`number`\>

Number of attachments deleted

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`deletePageAttachments`](../../BaseAttachmentProvider/classes/default.md#deletepageattachments)

***

### filesInStoreForPage()

> __filesInStoreForPage__(`location`, `pageName`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1115

A store's files that were uploaded onto `pageName`.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### pageName

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`filesInStoreForPage`](../../BaseAttachmentProvider/classes/default.md#filesinstoreforpage)

***

### getAllAttachments()

> __getAllAttachments__(): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1531

Get all attachments metadata

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAllAttachments`](../../BaseAttachmentProvider/classes/default.md#getallattachments)

***

### getAttachment()

> __getAttachment__(`attachmentId`): `Promise`\<[`AttachmentResult`](../../BaseAttachmentProvider/interfaces/AttachmentResult.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:889

Get attachment file and metadata

Falls back to a disk scan when metadata is missing but a file matching
`{attachmentId}.*` exists in the storage directory (orphaned file). This
handles the case where attachment metadata was lost without requiring a
data repair before the file can be served. A warning is logged so operators
know the metadata repair is still needed.

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentResult`](../../BaseAttachmentProvider/interfaces/AttachmentResult.md) \| `null`\>

File buffer and metadata or null

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAttachment`](../../BaseAttachmentProvider/classes/default.md#getattachment)

***

### getAttachmentByFilename()

> __getAttachmentByFilename__(`filename`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1616

Find an attachment by its original filename across all attachments

#### Parameters

##### filename

`string`

Original filename to search for

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Matching attachment metadata or null

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAttachmentByFilename`](../../BaseAttachmentProvider/classes/default.md#getattachmentbyfilename)

***

### getAttachmentMetadata()

> __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1428

Get attachment metadata only

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Attachment metadata or null

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAttachmentMetadata`](../../BaseAttachmentProvider/classes/default.md#getattachmentmetadata)

***

### getAttachmentsForPage()

> __getAttachmentsForPage__(`pageName`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1575

Get attachments used by a specific page

#### Parameters

##### pageName

`string`

Page name/title

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAttachmentsForPage`](../../BaseAttachmentProvider/classes/default.md#getattachmentsforpage)

***

### getById()

> __getById__(`id`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:2389

AssetProvider.getById() — returns AssetRecord for the given attachment ID.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`getById`](../../../types/Asset/interfaces/AssetProvider.md#getbyid)

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

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getDurability`](../../BaseAttachmentProvider/classes/default.md#getdurability)

***

### getFileInStore()

> __getFileInStore__(`location`, `id`): `Promise`\<\{ `bytes`: `Buffer`; `entry`: [`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md); \} \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1103

One file of a store, with its bytes; null when the store does not list it.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

#### Returns

`Promise`\<\{ `bytes`: `Buffer`; `entry`: [`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md); \} \| `null`\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getFileInStore`](../../BaseAttachmentProvider/classes/default.md#getfileinstore)

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BasicAttachmentProvider.ts:1764

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getProviderInfo`](../../BaseAttachmentProvider/classes/default.md#getproviderinfo)

***

### getQuarantineDir()

> __getQuarantineDir__(): `string` \| `null`

Defined in: src/providers/BasicAttachmentProvider.ts:1756

# 865 Slice 3: absolute quarantine directory path (for manifests/report).

#### Returns

`string` \| `null`

***

### getThumbnail()

> __getThumbnail__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1871

AssetProvider.getThumbnail() — generate (and cache) a JPEG thumbnail for image attachments.
Returns null for non-image attachments or when the source file cannot be processed.

#### Parameters

##### id

`string`

##### size

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`getThumbnail`](../../../types/Asset/interfaces/AssetProvider.md#getthumbnail)

***

### healthCheck()

> __healthCheck__(): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:418

Verify that the attachment storage directory is accessible.

Returns false when the directory cannot be read — e.g. a NAS or SLOW_STORAGE
volume that has been unmounted or an SMB share that has dropped.  AssetManager
uses this to skip the provider during fan-out rather than surfacing I/O errors
to end users.

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`healthCheck`](../../../types/Asset/interfaces/AssetProvider.md#healthcheck)

***

### initialize()

> __initialize__(`options?`): `Promise`\<`void`\>

Defined in: src/providers/BasicAttachmentProvider.ts:306

Initialize the provider
All configuration access via ConfigurationManager

#### Parameters

##### options?

###### readOnly?

`boolean`

Open for reading only (#1852): load the index and
  change nothing on disk. No staged restore is applied, no folder is
  created, and neither start-up migration (legacy private files, stale
  paths) runs. For an operator report such as the files dry run.

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`initialize`](../../BaseAttachmentProvider/classes/default.md#initialize)

***

### listAttachments()

> __listAttachments__(`pageUuid`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1645

List attachments for a page (AttachmentProvider interface method)

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`listAttachments`](../../BaseAttachmentProvider/classes/default.md#listattachments)

***

### listFilesInStore()

> __listFilesInStore__(`location`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1110

Everything this store lists, newest first — the store's half of a merged list (#1460).

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

***

### listStorageFiles()

> __listStorageFiles__(): `Promise`\<`string`[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:1682

# 865 Slice 2: basenames of all stored attachment files on disk (top-level
storage dir; excludes .json bookkeeping). Used by the health report to
find recordless files and missing-file records.

#### Returns

`Promise`\<`string`[]\>

***

### noteStoreRenumbered()

> __noteStoreRenumbered__(`location`, `pairs`): `Promise`\<`void`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1038

Adds `pairs` (takeout id → id here) to [readStoreRenumbered](#readstorerenumbered)'s; a later pair for an id replaces the earlier.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### pairs

`ReadonlyMap`\<`string`, `string`\>

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`noteStoreRenumbered`](../../BaseAttachmentProvider/classes/default.md#notestorerenumbered)

***

### privateRecordsInSharedIndex()

> __privateRecordsInSharedIndex__(): `object`[]

Defined in: src/providers/BasicAttachmentProvider.ts:1233

The private records still sitting in the shared index (#1460) — what the
start-up migration has to move. Identifier, owner and store only: enough
to place the file, and nothing of its name leaves this method.

Two ways a record says it is private, in order:

- `isPrivate`, #1398's flag, written by `storeAttachmentInternal` together
  with `creator` and `store`. That is the record deciding from itself.
- failing that, a mention naming a private page — `private/{owner}/{store}/{title}`
  since #1456. The record is then placed by the page it is attached to,
  with `owner: null` so the caller confirms it through PageManager, which
  is what actually knows whose store a page is in.

A record that is neither is a public attachment and is not listed: the
shared pool is exactly what stays behind.

#### Returns

`object`[]

***

### quarantineAttachment()

> __quarantineAttachment__(`identifier`, `manifestPath`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1706

# 865 Slice 3: move an attachment (record + stored file) into the
quarantine subdirectory instead of hard-deleting. The record is removed
from live metadata and appended to a per-run manifest inside quarantine/
so the operation is reversible by hand. Skips (returns false) on any
error — never deletes on failure (media-prune #867 precedent).

#### Parameters

##### identifier

`string`

##### manifestPath

`string`

#### Returns

`Promise`\<`boolean`\>

***

### quarantineFile()

> __quarantineFile__(`basename`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1736

# 865 Slice 3: move a recordless disk file into quarantine. Skips on error.

#### Parameters

##### basename

`string`

#### Returns

`Promise`\<`boolean`\>

***

### readStoreRenumbered()

> __readStoreRenumbered__(`location`): `Promise`\<`Map`\<`string`, `string`\>\>

Defined in: src/providers/BasicAttachmentProvider.ts:1028

The ids a takeout import last gave the store's files that could not keep
their own (#2188), as takeout id → id here. Kept apart from the index, so
it outlives a delete of the file. Ids only.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<`Map`\<`string`, `string`\>\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`readStoreRenumbered`](../../BaseAttachmentProvider/classes/default.md#readstorerenumbered)

***

### refreshAttachmentList()

> __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1672

Refresh attachment list (rescan storage)

#### Returns

`Promise`\<`void`\>

Promise that resolves when complete

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`refreshAttachmentList`](../../BaseAttachmentProvider/classes/default.md#refreshattachmentlist)

***

### removeRecordFromPool()

> __removeRecordFromPool__(`id`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1392

Take a file out of the shared pool: its record, its bytes and any cached
thumbnails of it (#1842) — used when the file has moved into a vault and
no public page uses it any more, so no public copy of it is left.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1838

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data

#### Returns

`Promise`\<`void`\>

Promise that resolves when complete

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`restore`](../../BaseAttachmentProvider/classes/default.md#restore)

***

### search()

> __search__(`query`): `Promise`\<[`AssetPage`](../../../types/Asset/interfaces/AssetPage.md)\>

Defined in: src/providers/BasicAttachmentProvider.ts:2206

AssetProvider.search() — searches by filename and description.

The shared pool only. A private store's files are in no shared index, so
they are searched through [searchFilesInStore](#searchfilesinstore), by the one caller
that has the requester's context to say which stores are theirs (#1460).

#### Parameters

##### query

[`AssetQuery`](../../../types/Asset/interfaces/AssetQuery.md)

#### Returns

`Promise`\<[`AssetPage`](../../../types/Asset/interfaces/AssetPage.md)\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`search`](../../../types/Asset/interfaces/AssetProvider.md#search)

***

### searchFilesInStore()

> __searchFilesInStore__(`location`, `query`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

Defined in: src/providers/BasicAttachmentProvider.ts:2225

One private store's files as search results (#1460) — the store's half of
an asset search, matched by the SAME rules the shared pool is, so a
private file is findable the way a public one is and no filter exists in
two places. Merging, sorting and paging are the caller's: it has the other
halves.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### query

[`AssetQuery`](../../../types/Asset/interfaces/AssetQuery.md)

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)[]\>

***

### setFileMentionInStore()

> __setFileMentionInStore__(`location`, `id`, `pageName`, `mentioned`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1124

Add or remove `pageName` in one store file's mentions (#1460) — the store
index's half of save-time mention sync. `false` when this store does not
list `id`, so a caller can try the next of its own stores.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### id

`string`

##### pageName

`string`

##### mentioned

`boolean`

#### Returns

`Promise`\<`boolean`\>

***

### setPoolMentions()

> __setPoolMentions__(`id`, `names`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1410

Set a shared-pool record's mentions to exactly `names` (#1842), keeping the
mention objects it already has for those names.

#### Parameters

##### id

`string`

##### names

`string`[]

#### Returns

`Promise`\<`boolean`\>

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:282

Shutdown the provider (cleanup resources)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`shutdown`](../../BaseAttachmentProvider/classes/default.md#shutdown)

***

### stageFilesRestore()

> __stageFilesRestore__(`providerBackup`, `files`, `readArchive`, `siteRestore`): `Promise`\<\{ `skippedVaults`: `string`[]; \}\>

Defined in: src/providers/BasicAttachmentProvider.ts:1814

Stage the files and the shared metadata from a backup for the next start
(#1876). The metadata is the document's; the live files and metadata are
not touched.

#### Parameters

##### providerBackup

`Record`\<`string`, `unknown`\>

##### files

[`AttachmentFilesBackupData`](../../attachmentFilesBackup/interfaces/AttachmentFilesBackupData.md)

##### readArchive

(`manager`, `archive`, `keyFingerprint`) => `object`

##### siteRestore

[`SiteRestoreStaging`](../../../managers/BaseManager/interfaces/SiteRestoreStaging.md)

#### Returns

`Promise`\<\{ `skippedVaults`: `string`[]; \}\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`stageFilesRestore`](../../BaseAttachmentProvider/classes/default.md#stagefilesrestore)

***

### store()

> __store__(`buffer`, `info`, `ctx`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)\>

Defined in: src/providers/BasicAttachmentProvider.ts:2399

AssetProvider.store() — routed through the asset-upload door,
AttachmentManager.uploadAttachment (#1629), so it gets the same
permission check, destination rules and audit record as every upload.

#### Parameters

##### buffer

`Buffer`

##### info

[`AssetInput`](../../../types/Asset/interfaces/AssetInput.md)

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md)\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`store`](../../../types/Asset/interfaces/AssetProvider.md#store)

***

### storeAttachment()

> __storeAttachment__(`fileBuffer`, `fileInfo`, `metadata?`, `user?`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: src/providers/BasicAttachmentProvider.ts:808

Store an attachment with metadata (BaseAttachmentProvider interface method)

#### Parameters

##### fileBuffer

`Buffer`

File data

##### fileInfo

[`FileInfo`](../../BaseAttachmentProvider/interfaces/FileInfo.md)

{ originalName, mimeType, size }

##### metadata?

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\> = `{}`

Attachment metadata

##### user?

[`User`](../../BaseAttachmentProvider/interfaces/User.md) \| `null` = `null`

User object

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`storeAttachment`](../../BaseAttachmentProvider/classes/default.md#storeattachment)

***

### storeFileInStore()

> __storeFileInStore__(`location`, `bytes`, `file`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)\>

Defined in: src/providers/BasicAttachmentProvider.ts:1047

Store a file in a store. The same bytes already in THAT store return the existing entry.

#### Parameters

##### location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### bytes

`Buffer`

##### file

[`StoreFileInput`](../../../types/Provider/interfaces/StoreFileInput.md)

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`storeFileInStore`](../../BaseAttachmentProvider/classes/default.md#storefileinstore)

***

### stream()

> __stream__(`id`): `Promise`\<`ReadableStream` \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:2425

AssetProvider.stream() — opens a read stream for the attachment file.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`ReadableStream` \| `null`\>

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`stream`](../../../types/Asset/interfaces/AssetProvider.md#stream)

***

### takeRestoreAtStart()

> __takeRestoreAtStart__(): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/providers/BasicAttachmentProvider.ts:1827

What the start did with a staged restore of the files (#1876), once; null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`takeRestoreAtStart`](../../BaseAttachmentProvider/classes/default.md#takerestoreatstart)

***

### toCreativeWork()

> __toCreativeWork__(`schema`): [`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md)

Defined in: src/providers/BasicAttachmentProvider.ts:2107

Convert a SchemaCreativeWork record to a schema.org-shaped CreativeWork
(Slice 5 of #755 / #759).

For PDF / docx / xlsx / pptx attachments → `DigitalDocument` with embedded
doc-metadata fields populated. For everything else → a base CreativeWork
(no subtype specialisation) — image/video attachments that need full
ImageObject / VideoObject treatment are out-of-scope for this slice
(they go through the media path).

Public so AttachmentManager (the registered `CatalogSource`) can call it
without exposing the internal SchemaCreativeWork shape.

#### Parameters

##### schema

`SchemaCreativeWork`

#### Returns

[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md)

***

### updateAttachmentMetadata()

> __updateAttachmentMetadata__(`attachmentId`, `updates`): `Promise`\<`boolean`\>

Defined in: src/providers/BasicAttachmentProvider.ts:1459

Update attachment metadata

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### updates

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Metadata updates

#### Returns

`Promise`\<`boolean`\>

Success status

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`updateAttachmentMetadata`](../../BaseAttachmentProvider/classes/default.md#updateattachmentmetadata)

***

### updateMetadata()

> __updateMetadata__(`id`, `patch`): `Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

Defined in: src/providers/BasicAttachmentProvider.ts:2337

AssetProvider.updateMetadata() — edit an attachment's descriptive metadata (#999).

__SIDECAR ONLY. This must never write into the file.__

Attachment IDs are CONTENT HASHES — see `calculateHash`, and note the
stored filename is `<sha256>.<ext>`. Media items are not content-addressed;
attachments are. Writing embedded metadata (EXIF/IPTC/XMP) rewrites the
file, so the id and filename stop matching the bytes they name:

    id       c3939c4391744bc8006f726c4e8333...
    file sha c7ae23c100d515d5...      <- after a single metadata write

Nothing errors; dedup and any integrity check simply stop being true. An
earlier version of this method did exactly that and was backed out
(`ffe16c0d`); the failure was only caught because restoring a test file
with `cmp` failed on a byte comparison.

Operator decision (2026-07-28): sidecar over re-hash-and-re-key. Re-keying
would be more honest — the file and its name would stay in agreement — but
the id is the URL, so every existing `[{ATTACH}]` reference on every page
would break on an edit. Content addressing is worth more than embedded
fidelity here.

__The consequence, which is real:__ an attachment's ngdpbase metadata and
its embedded metadata diverge after an edit, and a download carries the
file's original values. Media items do not behave this way. If embedded
fidelity matters for a given file, it belongs in the media library, which
is not content-addressed and does write through.

The tag mapping in `utils/assetMetadataTags` is deliberately NOT used here.
It is correct, and it is for providers that write to files.

#### Parameters

##### id

`string`

Attachment identifier (content hash)

##### patch

[`AssetMetadataPatch`](../../../types/Asset/interfaces/AssetMetadataPatch.md)

Fields to change; `null` clears, omission leaves alone

#### Returns

`Promise`\<[`AssetRecord`](../../../types/Asset/interfaces/AssetRecord.md) \| `null`\>

The refreshed record, or null when the attachment is unknown

#### Throws

Error when `dateTimeOriginal` is present but unparseable

#### Implementation of

[`AssetProvider`](../../../types/Asset/interfaces/AssetProvider.md).[`updateMetadata`](../../../types/Asset/interfaces/AssetProvider.md#updatemetadata)
