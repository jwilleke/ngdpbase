[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / AttachmentMetadata

# Interface: AttachmentMetadata

Defined in: src/types/Provider.ts:636

Attachment metadata

## Indexable

> \[`key`: `string`\]: `unknown`

Additional metadata

## Properties

### alreadyHeld?

> `optional` __alreadyHeld?__: `boolean`

Defined in: src/types/Provider.ts:669

True when the store already held these bytes and stored nothing new
(#2130): the record returned is the existing one, under its own name.
Set by `storeAttachment`; absent for a new file.

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Provider.ts:662

Description

***

### filename

> __filename__: `string`

Defined in: src/types/Provider.ts:641

Filename

***

### filePath

> __filePath__: `string`

Defined in: src/types/Provider.ts:659

File path

***

### id

> __id__: `string`

Defined in: src/types/Provider.ts:638

Attachment ID (UUID)

***

### mimeType

> __mimeType__: `string`

Defined in: src/types/Provider.ts:647

MIME type

***

### pageUuid

> __pageUuid__: `string`

Defined in: src/types/Provider.ts:644

Page UUID this attachment belongs to

***

### size

> __size__: `number`

Defined in: src/types/Provider.ts:650

File size in bytes

***

### uploadedAt

> __uploadedAt__: `string`

Defined in: src/types/Provider.ts:653

Upload timestamp (ISO 8601)

***

### uploadedBy

> __uploadedBy__: `string`

Defined in: src/types/Provider.ts:656

Uploader user ID
