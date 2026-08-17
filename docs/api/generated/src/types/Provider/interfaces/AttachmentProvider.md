[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Provider](../README.md) / AttachmentProvider

# Interface: AttachmentProvider

Defined in: [src/types/Provider.ts:350](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L350)

Attachment provider interface

Defines the contract for attachment storage backends.

## Extends

- [`BaseProvider`](BaseProvider.md)

## Properties

### engine

> __engine__: [`WikiEngine`](../../WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/types/Provider.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L37)

Reference to WikiEngine

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`engine`](BaseProvider.md#engine)

***

### initialized

> __initialized__: `boolean`

Defined in: [src/types/Provider.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L40)

Whether provider has been initialized

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialized`](BaseProvider.md#initialized)

## Methods

### backup()?

> `optional` __backup__(): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [src/types/Provider.ts:64](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L64)

Backup provider data

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

Promise resolving to backup data

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`backup`](BaseProvider.md#backup)

***

### deleteAttachment()

> __deleteAttachment__(`attachmentId`): `Promise`\<`boolean`\>

Defined in: [src/types/Provider.ts:387](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L387)

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

Defined in: [src/types/Provider.ts:394](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L394)

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

Defined in: [src/types/Provider.ts:366](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L366)

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

Defined in: [src/types/Provider.ts:373](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L373)

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

Defined in: [src/types/Provider.ts:58](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L58)

Get provider information

#### Returns

[`ProviderInfo`](ProviderInfo.md)

Provider metadata

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`getProviderInfo`](BaseProvider.md#getproviderinfo)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L46)

Initialize the provider

#### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`initialize`](BaseProvider.md#initialize)

***

### listAttachments()

> __listAttachments__(`pageUuid`): `Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md)[]\>

Defined in: [src/types/Provider.ts:380](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L380)

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

Defined in: [src/types/Provider.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L71)

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

### saveAttachment()

> __saveAttachment__(`pageUuid`, `filename`, `buffer`, `metadata?`): `Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md)\>

Defined in: [src/types/Provider.ts:359](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L359)

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

`Promise`\<[`AttachmentMetadata`](AttachmentMetadata.md)\>

Attachment metadata

***

### shutdown()?

> `optional` __shutdown__(): `Promise`\<`void`\>

Defined in: [src/types/Provider.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L52)

Shutdown the provider (optional)

#### Returns

`Promise`\<`void`\>

Promise that resolves when shutdown is complete

#### Inherited from

[`BaseProvider`](BaseProvider.md).[`shutdown`](BaseProvider.md#shutdown)
