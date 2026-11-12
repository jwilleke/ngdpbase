[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAttachmentProvider](../README.md) / default

# Abstract Class: default

Defined in: src/providers/BaseAttachmentProvider.ts:63

BaseAttachmentProvider - Abstract interface for attachment storage providers

All attachment storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of wiki attachments (files, images, etc.),
whether from filesystem, database, cloud storage, or other backends.

Following JSPWiki's attachment provider pattern.

 BaseAttachmentProvider

## See

- BasicAttachmentProvider for filesystem implementation
- AttachmentManager for usage

## Extends

- [`default`](../../BaseProvider/classes/default.md)

## Extended by

- [`default`](../../BasicAttachmentProvider/classes/default.md)

## Implements

- [`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseAttachmentProvider`

Defined in: src/providers/BaseAttachmentProvider.ts:77

Create a new attachment provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BaseAttachmentProvider`

#### Throws

If engine is not provided

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`constructor`](../../BaseProvider/classes/default.md#constructor)

## Properties

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/providers/BaseAttachmentProvider.ts:65

Reference to the wiki engine

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/providers/BaseAttachmentProvider.ts:68

Whether provider has been initialized

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

### attachmentExists()

> `abstract` __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseAttachmentProvider.ts:153

Check if attachment exists

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

***

### backup()

> `abstract` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/providers/BaseAttachmentProvider.ts:256

Backup provider data
Returns all metadata needed to restore attachments

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Backup data

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`backup`](../../../types/Provider/interfaces/AttachmentProvider.md#backup)

***

### backupFiles()?

> `optional` __backupFiles__(`archive`): `Promise`\<[`AttachmentFilesBackupOutcome`](../../attachmentFilesBackup/interfaces/AttachmentFilesBackupOutcome.md)\>

Defined in: src/providers/BaseAttachmentProvider.ts:270

Write the attachment files themselves beside the backup document (#1876),
streamed, bytes as stored. A provider without it can't be backed up whole,
and AttachmentManager's backup says so.

#### Parameters

##### archive

(`part`) => [`BackupArchiveTarget`](../../../managers/BaseManager/interfaces/BackupArchiveTarget.md)

#### Returns

`Promise`\<[`AttachmentFilesBackupOutcome`](../../attachmentFilesBackup/interfaces/AttachmentFilesBackupOutcome.md)\>

***

### deleteAttachment()

> `abstract` __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseAttachmentProvider.ts:146

Delete an attachment

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`deleteAttachment`](../../../types/Provider/interfaces/AttachmentProvider.md#deleteattachment)

***

### deleteFileInStore()

> __deleteFileInStore__(`_location`, `_id`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

Defined in: src/providers/BaseAttachmentProvider.ts:217

Delete a file from a store: its bytes and its index entry. Null when the store does not list it.

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### \_id

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md) \| `null`\>

***

### deletePageAttachments()

> `abstract` __deletePageAttachments__(`pageUuid`): `Promise`\<`number`\>

Defined in: src/providers/BaseAttachmentProvider.ts:180

Delete all attachments for a page

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<`number`\>

Number of attachments deleted

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`deletePageAttachments`](../../../types/Provider/interfaces/AttachmentProvider.md#deletepageattachments)

***

### filesInStoreForPage()

> __filesInStoreForPage__(`_location`, `_pageName`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

Defined in: src/providers/BaseAttachmentProvider.ts:212

A store's files that were uploaded onto `pageName`.

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### \_pageName

`string`

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)[]\>

***

### getAllAttachments()

> `abstract` __getAllAttachments__(): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BaseAttachmentProvider.ts:159

Get all attachments metadata (without file data)

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

***

### getAttachment()

> `abstract` __getAttachment__(`attachmentId`): `Promise`\<[`AttachmentResult`](../interfaces/AttachmentResult.md) \| `null`\>

Defined in: src/providers/BaseAttachmentProvider.ts:121

Get attachment file data

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentResult`](../interfaces/AttachmentResult.md) \| `null`\>

File buffer and metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`getAttachment`](../../../types/Provider/interfaces/AttachmentProvider.md#getattachment)

***

### getAttachmentByFilename()

> __getAttachmentByFilename__(`_filename`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/providers/BaseAttachmentProvider.ts:187

Find an attachment by its original filename across all attachments

#### Parameters

##### \_filename

`string`

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Matching attachment metadata or null

***

### getAttachmentMetadata()

> `abstract` __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: src/providers/BaseAttachmentProvider.ts:128

Get attachment metadata only (no file data)

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Attachment metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`getAttachmentMetadata`](../../../types/Provider/interfaces/AttachmentProvider.md#getattachmentmetadata)

***

### getAttachmentsForPage()

> `abstract` __getAttachmentsForPage__(`pageName`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BaseAttachmentProvider.ts:166

Get attachments used by a specific page

#### Parameters

##### pageName

`string`

Page name/title

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

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

### getFileInStore()

> __getFileInStore__(`_location`, `_id`): `Promise`\<\{ `bytes`: `Buffer`; `entry`: [`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md); \} \| `null`\>

Defined in: src/providers/BaseAttachmentProvider.ts:207

One file of a store, with its bytes; null when the store does not list it.

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### \_id

`string`

#### Returns

`Promise`\<\{ `bytes`: `Buffer`; `entry`: [`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md); \} \| `null`\>

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Defined in: src/providers/BaseAttachmentProvider.ts:242

Get provider information

#### Returns

[`ProviderInfo`](../../../types/Provider/interfaces/ProviderInfo.md)

Provider metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`getProviderInfo`](../../../types/Provider/interfaces/AttachmentProvider.md#getproviderinfo)

#### Overrides

[`default`](../../BaseProvider/classes/default.md).[`getProviderInfo`](../../BaseProvider/classes/default.md#getproviderinfo)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:97

Initialize the provider

IMPORTANT: Providers MUST access configuration via ConfigurationManager:
  const configManager = this.engine.getManager('ConfigurationManager');
  const value = configManager.getProperty('key', 'default');

Do NOT read configuration files directly.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`initialize`](../../../types/Provider/interfaces/AttachmentProvider.md#initialize)

***

### listAttachments()

> `abstract` __listAttachments__(`pageUuid`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: src/providers/BaseAttachmentProvider.ts:173

List attachments for a page (AttachmentProvider interface method)

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`listAttachments`](../../../types/Provider/interfaces/AttachmentProvider.md#listattachments)

***

### noteStoreRenumbered()

> __noteStoreRenumbered__(`_location`, `_pairs`): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:227

Adds takeout id → id pairs to [readStoreRenumbered](#readstorerenumbered)'s (#2188).

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### \_pairs

`ReadonlyMap`\<`string`, `string`\>

#### Returns

`Promise`\<`void`\>

***

### readStoreRenumbered()

> __readStoreRenumbered__(`_location`): `Promise`\<`Map`\<`string`, `string`\>\>

Defined in: src/providers/BaseAttachmentProvider.ts:222

The ids a takeout import gave a store's files that could not keep their own, as takeout id → id here (#2188).

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

#### Returns

`Promise`\<`Map`\<`string`, `string`\>\>

***

### refreshAttachmentList()

> `abstract` __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:236

Refresh internal cache/index
Re-scans storage and rebuilds indexes

#### Returns

`Promise`\<`void`\>

***

### restore()

> `abstract` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:263

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup()

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`restore`](../../../types/Provider/interfaces/AttachmentProvider.md#restore)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/providers/BaseAttachmentProvider.ts:282

Shutdown the provider (cleanup resources)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`shutdown`](../../../types/Provider/interfaces/AttachmentProvider.md#shutdown)

***

### stageFilesRestore()?

> `optional` __stageFilesRestore__(`providerBackup`, `files`, `readArchive`, `siteRestore`): `Promise`\<\{ `skippedVaults`: `string`[]; \}\>

Defined in: src/providers/BaseAttachmentProvider.ts:273

Stage the files and metadata from a backup for the next start, as part of a site restore (#1876).

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

***

### storeAttachment()

> __storeAttachment__(`_fileBuffer`, `_fileInfo`, `_metadata?`, `_user?`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: src/providers/BaseAttachmentProvider.ts:107

Upload/store an attachment with metadata (legacy method for backward compatibility)

#### Parameters

##### \_fileBuffer

`Buffer`

##### \_fileInfo

[`FileInfo`](../interfaces/FileInfo.md)

##### \_metadata?

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\> = `{}`

Attachment metadata

##### \_user?

[`User`](../interfaces/User.md) \| `null` = `null`

User uploading the attachment

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata with ID

***

### storeFileInStore()

> __storeFileInStore__(`_location`, `_bytes`, `_file`): `Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)\>

Defined in: src/providers/BaseAttachmentProvider.ts:198

Store a file in a store. The same bytes already in THAT store return the existing entry.

#### Parameters

##### \_location

[`StoreFileLocation`](../../../types/Provider/interfaces/StoreFileLocation.md)

##### \_bytes

`Buffer`

##### \_file

[`StoreFileInput`](../../../types/Provider/interfaces/StoreFileInput.md)

#### Returns

`Promise`\<[`StoreFileEntry`](../../../types/Provider/interfaces/StoreFileEntry.md)\>

***

### takeRestoreAtStart()?

> `optional` __takeRestoreAtStart__(): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/providers/BaseAttachmentProvider.ts:276

What the start did with a staged restore of the files (#1876), once; null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

***

### updateAttachmentMetadata()

> `abstract` __updateAttachmentMetadata__(`attachmentId`, `metadata`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseAttachmentProvider.ts:136

Update attachment metadata (e.g., add page reference)

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### metadata

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Updated metadata

#### Returns

`Promise`\<`boolean`\>

Success status
