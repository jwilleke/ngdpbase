[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BaseAttachmentProvider](../README.md) / default

# Abstract Class: default

Defined in: [src/providers/BaseAttachmentProvider.ts:59](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L59)

BaseAttachmentProvider - Abstract interface for attachment storage providers

All attachment storage providers must extend this class and implement its methods.
Providers handle the actual storage and retrieval of wiki attachments (files, images, etc.),
whether from filesystem, database, cloud storage, or other backends.

Following JSPWiki's attachment provider pattern.

 BaseAttachmentProvider

## See

- BasicAttachmentProvider for filesystem implementation
- AttachmentManager for usage

## Extended by

- [`default`](../../BasicAttachmentProvider/classes/default.md)

## Implements

- [`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md)

## Constructors

### Constructor

> __new default__(`engine`): `BaseAttachmentProvider`

Defined in: [src/providers/BaseAttachmentProvider.ts:73](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L73)

Create a new attachment provider

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The WikiEngine instance

#### Returns

`BaseAttachmentProvider`

#### Throws

If engine is not provided

## Properties

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/providers/BaseAttachmentProvider.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L61)

Reference to the wiki engine

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`engine`](../../../types/Provider/interfaces/AttachmentProvider.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/providers/BaseAttachmentProvider.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L64)

Whether provider has been initialized

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`initialized`](../../../types/Provider/interfaces/AttachmentProvider.md#initialized)

## Methods

### attachmentExists()

> `abstract` __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:163](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L163)

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

Defined in: [src/providers/BaseAttachmentProvider.ts:217](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L217)

Backup provider data
Returns all metadata needed to restore attachments

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Backup data

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`backup`](../../../types/Provider/interfaces/AttachmentProvider.md#backup)

***

### deleteAttachment()

> `abstract` __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:156](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L156)

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

### deletePageAttachments()

> `abstract` __deletePageAttachments__(`pageUuid`): `Promise`\<`number`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L190)

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

### getAllAttachments()

> `abstract` __getAllAttachments__(): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Defined in: [src/providers/BaseAttachmentProvider.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L169)

Get all attachments metadata (without file data)

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

***

### getAttachment()

> `abstract` __getAttachment__(`attachmentId`): `Promise`\<[`AttachmentResult`](../interfaces/AttachmentResult.md) \| `null`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L131)

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

### getAttachmentMetadata()

> `abstract` __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:138](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L138)

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

Defined in: [src/providers/BaseAttachmentProvider.ts:176](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L176)

Get attachments used by a specific page

#### Parameters

##### pageName

`string`

Page name/title

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)[]\>

Array of attachment metadata

***

### getProviderInfo()

> __getProviderInfo__(): [`ProviderInfo`](../../BasePageProvider/interfaces/ProviderInfo.md)

Defined in: [src/providers/BaseAttachmentProvider.ts:203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L203)

Get provider information

#### Returns

[`ProviderInfo`](../../BasePageProvider/interfaces/ProviderInfo.md)

Provider metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`getProviderInfo`](../../../types/Provider/interfaces/AttachmentProvider.md#getproviderinfo)

***

### initialize()

> `abstract` __initialize__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:92](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L92)

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

Defined in: [src/providers/BaseAttachmentProvider.ts:183](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L183)

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

### refreshAttachmentList()

> `abstract` __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:197](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L197)

Refresh internal cache/index
Re-scans storage and rebuilds indexes

#### Returns

`Promise`\<`void`\>

***

### restore()

> `abstract` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:224](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L224)

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

### saveAttachment()

> `abstract` __saveAttachment__(`pageUuid`, `filename`, `buffer`, `metadata?`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: [src/providers/BaseAttachmentProvider.ts:102](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L102)

Save attachment

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

##### metadata?

`Record`\<`string`, `unknown`\>

Additional metadata

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`saveAttachment`](../../../types/Provider/interfaces/AttachmentProvider.md#saveattachment)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L231)

Shutdown the provider (cleanup resources)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AttachmentProvider`](../../../types/Provider/interfaces/AttachmentProvider.md).[`shutdown`](../../../types/Provider/interfaces/AttachmentProvider.md#shutdown)

***

### storeAttachment()

> __storeAttachment__(`_fileBuffer`, `_fileInfo`, `_metadata`, `_user`): `Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Defined in: [src/providers/BaseAttachmentProvider.ts:117](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L117)

Upload/store an attachment with metadata (legacy method for backward compatibility)

#### Parameters

##### \_fileBuffer

`Buffer`

##### \_fileInfo

[`FileInfo`](../interfaces/FileInfo.md)

##### \_metadata

`Partial`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\> = `{}`

Attachment metadata

##### \_user

User uploading the attachment

[`User`](../interfaces/User.md) | `null`

#### Returns

`Promise`\<[`AttachmentMetadata`](../../../types/Provider/interfaces/AttachmentMetadata.md)\>

Attachment metadata with ID

***

### updateAttachmentMetadata()

> `abstract` __updateAttachmentMetadata__(`attachmentId`, `metadata`): `Promise`\<`boolean`\>

Defined in: [src/providers/BaseAttachmentProvider.ts:146](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAttachmentProvider.ts#L146)

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
