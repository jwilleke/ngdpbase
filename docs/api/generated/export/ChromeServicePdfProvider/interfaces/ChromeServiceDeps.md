[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/ChromeServicePdfProvider](../README.md) / ChromeServiceDeps

# Interface: ChromeServiceDeps

Defined in: src/export/ChromeServicePdfProvider.ts:60

Hooks for tests; a site passes nothing.

## Properties

### normalize?

> `optional` __normalize?__: (`pdf`, `timeoutMs`) => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: src/export/ChromeServicePdfProvider.ts:63

#### Parameters

##### pdf

`Uint8Array`

##### timeoutMs

`number`

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### resolver?

> `optional` __resolver?__: [`Resolver`](../../../http/guardedLookup/type-aliases/Resolver.md)

Defined in: src/export/ChromeServicePdfProvider.ts:62

***

### transport?

> `optional` __transport?__: [`Transport`](../../../http/guardedFetch/type-aliases/Transport.md)

Defined in: src/export/ChromeServicePdfProvider.ts:61
