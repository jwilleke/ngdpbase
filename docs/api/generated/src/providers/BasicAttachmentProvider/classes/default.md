[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BasicAttachmentProvider](../README.md) / default

# Class: default

Defined in: [src/providers/BasicAttachmentProvider.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L99)

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

## Constructors

### Constructor

> __new default__(`engine`): `BasicAttachmentProvider`

Defined in: [src/providers/BasicAttachmentProvider.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L107)

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`BasicAttachmentProvider`

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`constructor`](../../BaseAttachmentProvider/classes/default.md#constructor)

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseAttachmentProvider.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L61)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`engine`](../../BaseAttachmentProvider/classes/default.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BaseAttachmentProvider.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L64)

Whether provider has been initialized

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`initialized`](../../BaseAttachmentProvider/classes/default.md#initialized)

## Methods

### attachmentExists()

> __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:607](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L607)

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

### backup()

> __backup__(): `Promise`\<`BackupData`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:729](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L729)

Backup provider data

#### Returns

`Promise`\<`BackupData`\>

Backup data

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`backup`](../../BaseAttachmentProvider/classes/default.md#backup)

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:579](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L579)

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

### deletePageAttachments()

> __deletePageAttachments__(`pageUuid`): `Promise`\<`number`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:682](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L682)

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

### getAllAttachments()

> __getAllAttachments__(): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: [src/providers/BasicAttachmentProvider.ts:615](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L615)

Get all attachments metadata

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getAllAttachments`](../../BaseAttachmentProvider/classes/default.md#getallattachments)

***

### getAttachment()

> __getAttachment__(`attachmentId`): `Promise`\<[`AttachmentResult`](../../BaseAttachmentProvider/interfaces/AttachmentResult.md) \| `null`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:488](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L488)

Get attachment file and metadata

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

### getAttachmentMetadata()

> __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:523](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L523)

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

Defined in: [src/providers/BasicAttachmentProvider.ts:637](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L637)

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

### getProviderInfo()

> __getProviderInfo__(): `ProviderInfo`

Defined in: [src/providers/BasicAttachmentProvider.ts:709](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L709)

Get provider information

#### Returns

`ProviderInfo`

Provider metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`getProviderInfo`](../../BaseAttachmentProvider/classes/default.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L121)

Initialize the provider
All configuration access via ConfigurationManager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`initialize`](../../BaseAttachmentProvider/classes/default.md#initialize)

***

### listAttachments()

> __listAttachments__(`pageUuid`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: [src/providers/BasicAttachmentProvider.ts:673](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L673)

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

### refreshAttachmentList()

> __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:700](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L700)

Refresh attachment list (rescan storage)

#### Returns

`Promise`\<`void`\>

Promise that resolves when complete

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`refreshAttachmentList`](../../BaseAttachmentProvider/classes/default.md#refreshattachmentlist)

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:748](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L748)

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

### saveAttachment()

> __saveAttachment__(`pageUuid`, `filename`, `buffer`, `metadata`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: [src/providers/BasicAttachmentProvider.ts:435](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L435)

Save attachment (AttachmentProvider interface method - alternative signature)

#### Parameters

##### pageUuid

`string`

Page UUID

##### filename

`string`

Filename

##### buffer

`Buffer`

File buffer

##### metadata

`Record`\<`string`, `unknown`\> = `{}`

Additional metadata

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`saveAttachment`](../../BaseAttachmentProvider/classes/default.md#saveattachment)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L231)

Shutdown the provider (cleanup resources)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseAttachmentProvider/classes/default.md).[`shutdown`](../../BaseAttachmentProvider/classes/default.md#shutdown)

***

### storeAttachment()

> __storeAttachment__(`fileBuffer`, `fileInfo`, `metadata`, `user`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: [src/providers/BasicAttachmentProvider.ts:389](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L389)

Store an attachment with metadata (BaseAttachmentProvider interface method)

#### Parameters

##### fileBuffer

`Buffer`

File data

##### fileInfo

[`FileInfo`](../../BaseAttachmentProvider/interfaces/FileInfo.md)

{ originalName, mimeType, size }

##### metadata

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\> = `{}`

Attachment metadata

##### user

User object

[`User`](../../BaseAttachmentProvider/interfaces/User.md) | `null`

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata

#### Overrides

[`default`](../../BaseAttachmentProvider/classes/default.md).[`storeAttachment`](../../BaseAttachmentProvider/classes/default.md#storeattachment)

***

### updateAttachmentMetadata()

> __updateAttachmentMetadata__(`attachmentId`, `updates`): `Promise`\<`boolean`\>

Defined in: [src/providers/BasicAttachmentProvider.ts:551](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BasicAttachmentProvider.ts#L551)

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
