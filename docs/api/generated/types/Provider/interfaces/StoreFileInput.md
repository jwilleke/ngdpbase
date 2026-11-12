[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / StoreFileInput

# Interface: StoreFileInput

Defined in: src/types/Provider.ts:716

What `storeFileInStore` is told about a file it stores in a private store.

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Provider.ts:720

***

### description

> __description__: `string`

Defined in: src/types/Provider.ts:719

***

### id?

> `optional` __id?__: `string`

Defined in: src/types/Provider.ts:733

The id to store the file under, set only by AttachmentManager for a file
a takeout re-import brings back (#2188), after it checked that no other
file anywhere holds it. A store that already lists the id refuses it.

***

### keptOriginal?

> `optional` __keptOriginal?__: `object`

Defined in: src/types/Provider.ts:727

Set only by AttachmentManager for an import's keep into the receiver's
own vault (#2061): `types` are allowed beyond the site's allow-list, and
the file is marked [StoreFileEntry.download](StoreFileEntry.md#download).

#### types

> __types__: readonly `string`[]

***

### mimeType

> __mimeType__: `string`

Defined in: src/types/Provider.ts:718

***

### originalName

> __originalName__: `string`

Defined in: src/types/Provider.ts:717

***

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/types/Provider.ts:721
