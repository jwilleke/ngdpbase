[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/AttachmentManager](../README.md) / default

# Class: default

Defined in: [src/managers/AttachmentManager.ts:131](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L131)

AttachmentManager - Manages file attachments for wiki pages

Following JSPWiki's AttachmentManager pattern, this manager:

- Delegates storage to pluggable attachment providers
- Enforces permissions via PolicyManager
- Tracks attachment-page relationships
- Provides high-level attachment operations

 AttachmentManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- BasicAttachmentProvider for default provider implementation

## Example

```ts
const attachmentManager = engine.getManager('AttachmentManager');
await attachmentManager.attachFile('Main', fileBuffer, 'document.pdf');

Based on:
https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/attachment/AttachmentManager.java
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `AttachmentManager`

Defined in: [src/managers/AttachmentManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L143)

Creates a new AttachmentManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`AttachmentManager`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### attachmentExists()

> __attachmentExists__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/managers/AttachmentManager.ts:459](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L459)

Check if an attachment exists

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<`boolean`\>

***

### attachToPage()

> __attachToPage__(`attachmentId`, `pageName`): `Promise`\<`boolean`\>

Defined in: [src/managers/AttachmentManager.ts:290](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L290)

Attach an existing attachment to a page

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### pageName

`string`

Page name to attach to

#### Returns

`Promise`\<`boolean`\>

Success status

***

### backup()

> __backup__(): `Promise`\<[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)\>

Defined in: [src/managers/AttachmentManager.ts:497](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L497)

Backup manager data
Delegates to provider's backup method

#### Returns

`Promise`\<[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`, `context?`): `Promise`\<`boolean`\>

Defined in: [src/managers/AttachmentManager.ts:408](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L408)

Delete an attachment

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### context?

[`UserContext`](../interfaces/UserContext.md)

WikiContext with user information

#### Returns

`Promise`\<`boolean`\>

Success status

***

### detachFromPage()

> __detachFromPage__(`attachmentId`, `pageName`): `Promise`\<`boolean`\>

Defined in: [src/managers/AttachmentManager.ts:328](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L328)

Detach an attachment from a page

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### pageName

`string`

Page name to detach from

#### Returns

`Promise`\<`boolean`\>

Success status

***

### getAllAttachments()

> __getAllAttachments__(): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: [src/managers/AttachmentManager.ts:393](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L393)

Get all attachments

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getAttachment()

> __getAttachment__(`attachmentId`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

Defined in: [src/managers/AttachmentManager.ts:352](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L352)

Get an attachment by ID

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](../interfaces/AttachmentMetadata.md); \} \| `null`\>

***

### getAttachmentMetadata()

> __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

Defined in: [src/managers/AttachmentManager.ts:366](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L366)

Get attachment metadata only

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md) \| `null`\>

***

### getAttachmentsForPage()

> __getAttachmentsForPage__(`pageName`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

Defined in: [src/managers/AttachmentManager.ts:380](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L380)

Get all attachments for a page

#### Parameters

##### pageName

`string`

Page name

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)[]\>

***

### getAttachmentUrl()

> __getAttachmentUrl__(`attachmentId`): `string`

Defined in: [src/managers/AttachmentManager.ts:473](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L473)

Get attachment URL

#### Parameters

##### attachmentId

`string`

Attachment identifier

#### Returns

`string`

URL path

***

### getCurrentAttachmentProvider()

> __getCurrentAttachmentProvider__(): `BaseAttachmentProvider` \| `null`

Defined in: [src/managers/AttachmentManager.ts:210](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L210)

Get current attachment provider

#### Returns

`BaseAttachmentProvider` \| `null`

Current provider instance

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L125)

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/AttachmentManager.ts:157](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L157)

Initialize AttachmentManager and load the configured provider

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/managers/BaseManager.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L113)

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

***

### refreshAttachmentList()

> __refreshAttachmentList__(): `Promise`\<`void`\>

Defined in: [src/managers/AttachmentManager.ts:482](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L482)

Refresh attachment list (rescan storage)

#### Returns

`Promise`\<`void`\>

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/AttachmentManager.ts:525](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L525)

Restore manager data from backup
Delegates to provider's restore method

#### Parameters

##### backupData

[`AttachmentBackupData`](../interfaces/AttachmentBackupData.md)

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/AttachmentManager.ts:548](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L548)

Shutdown the manager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### updateAttachmentMetadata()

> __updateAttachmentMetadata__(`attachmentId`, `updates`, `context?`): `Promise`\<`boolean`\>

Defined in: [src/managers/AttachmentManager.ts:430](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L430)

Update attachment metadata

#### Parameters

##### attachmentId

`string`

Attachment identifier

##### updates

`Partial`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Metadata updates

##### context?

[`UserContext`](../interfaces/UserContext.md)

WikiContext with user information

#### Returns

`Promise`\<`boolean`\>

Success status

***

### uploadAttachment()

> __uploadAttachment__(`fileBuffer`, `fileInfo`, `options`): `Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Defined in: [src/managers/AttachmentManager.ts:246](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L246)

Upload an attachment

#### Parameters

##### fileBuffer

`Buffer`

File data

##### fileInfo

[`FileInfo`](../interfaces/FileInfo.md)

{ originalName, mimeType, size }

##### options

[`UploadOptions`](../interfaces/UploadOptions.md) = `{}`

Upload options

#### Returns

`Promise`\<[`AttachmentMetadata`](../interfaces/AttachmentMetadata.md)\>

Attachment metadata
