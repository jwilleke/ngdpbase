[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / AttachmentProvider

# Interface: AttachmentProvider

Defined in: src/types/Provider.ts:790

Attachment provider interface

Defines the contract for attachment storage backends.

## Extends

- [`BaseProvider`](BaseProvider.md)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: src/types/Provider.ts:75

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: src/types/Provider.ts:817

Delete attachment

#### Parameters

##### attachmentId

`string`

Attachment ID

#### Returns

`Promise`\<`boolean`\>

True if deleted, false if not found

***

### deletePageAttachments()

> __deletePageAttachments__(`pageUuid`): `Promise`\<`number`\>

Defined in: src/types/Provider.ts:824

Delete all attachments for a page

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<`number`\>

Number of attachments deleted

***

### getAttachment()

> __getAttachment__(`attachmentId`): `Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](AttachmentMetadata.md); \} \| `null`\>

Defined in: src/types/Provider.ts:796

Get attachment

#### Parameters

##### attachmentId

`string`

Attachment ID

#### Returns

`Promise`\<\{ `buffer`: `Buffer`; `metadata`: [`AttachmentMetadata`](AttachmentMetadata.md); \} \| `null`\>

File buffer and metadata

***

### getAttachmentMetadata()

> __getAttachmentMetadata__(`attachmentId`): `Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md) \| `null`\>

Defined in: src/types/Provider.ts:803

Get attachment metadata

#### Parameters

##### attachmentId

`string`

Attachment ID

#### Returns

`Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md) \| `null`\>

Attachment metadata or null

***

### getProviderInfo()?

> `optional` __getProviderInfo__(): [`ProviderInfo`](ProviderInfo.md)

Defined in: src/types/Provider.ts:69

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:57

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### listAttachments()

> __listAttachments__(`pageUuid`): `Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md)[]\>

Defined in: src/types/Provider.ts:810

List attachments for a page

#### Parameters

##### pageUuid

`string`

Page UUID

#### Returns

`Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md)[]\>

Array of attachment metadata

***

### restore()?

> `optional` __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:82

Restore provider data from backup

#### Parameters

##### backupData

`Record`\<`string`, `unknown`\>

Backup data from backup() method

#### Returns

`Promise`\<`void`\>

Promise that resolves when restore is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`restore`](BaseProvider.md#restore)

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: src/types/Provider.ts:63

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
