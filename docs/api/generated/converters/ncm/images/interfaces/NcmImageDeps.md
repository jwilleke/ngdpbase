[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/images](../README.md) / NcmImageDeps

# Interface: NcmImageDeps

Defined in: src/converters/ncm/images.ts:37

Injected I/O so the rule is pure-testable; S5 supplies the real impls.

## Methods

### fetchBytes()

> __fetchBytes__(`url`, `timeoutMs`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/converters/ncm/images.ts:39

Fetch raw bytes with the given timeout. Reject/throw or return error.

#### Parameters

##### url

`string`

##### timeoutMs

`number`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### storeAttachment()

> __storeAttachment__(`input`): `Promise`\<`string`\>

Defined in: src/converters/ncm/images.ts:41

Persist the image; return the local reference to put in `![alt](ref)`.

#### Parameters

##### input

###### bytes

`Buffer`

###### mime

`string`

###### sourceUrl

`string`

#### Returns

`Promise`\<`string`\>
