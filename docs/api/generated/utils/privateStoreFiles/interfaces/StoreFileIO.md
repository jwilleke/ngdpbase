[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / StoreFileIO

# Interface: StoreFileIO

Defined in: src/utils/privateStoreFiles.ts:31

## Properties

### sealed

> `readonly` __sealed__: `boolean`

Defined in: src/utils/privateStoreFiles.ts:33

True when this store's files are ciphertext at rest.

## Methods

### readBytes()

> __readBytes__(`file`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/utils/privateStoreFiles.ts:37

A store file's bytes — attachments (#1400) are binary, pages are text.

#### Parameters

##### file

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### readText()

> __readText__(`file`, `encoding?`): `Promise`\<`string`\>

Defined in: src/utils/privateStoreFiles.ts:34

#### Parameters

##### file

`string`

##### encoding?

`BufferEncoding`

#### Returns

`Promise`\<`string`\>

***

### writeBytes()

> __writeBytes__(`file`, `bytes`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreFiles.ts:38

#### Parameters

##### file

`string`

##### bytes

`Buffer`

#### Returns

`Promise`\<`void`\>

***

### writeText()

> __writeText__(`file`, `text`, `encoding?`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreFiles.ts:35

#### Parameters

##### file

`string`

##### text

`string`

##### encoding?

`BufferEncoding`

#### Returns

`Promise`\<`void`\>
