[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/LocalChromePdfProvider](../README.md) / LocalChromeDeps

# Interface: LocalChromeDeps

Defined in: src/export/LocalChromePdfProvider.ts:19

Hooks for tests; a site passes nothing.

## Properties

### render?

> `optional` __render?__: (`job`) => `Promise`\<[`PdfJobResult`](../../pdfEngine/type-aliases/PdfJobResult.md)\>

Defined in: src/export/LocalChromePdfProvider.ts:20

#### Parameters

##### job

[`PdfJob`](../../pdfEngine/interfaces/PdfJob.md)

#### Returns

`Promise`\<[`PdfJobResult`](../../pdfEngine/type-aliases/PdfJobResult.md)\>

***

### resolve?

> `optional` __resolve?__: (`configuredPath`) => `Promise`\<[`ChromiumResolution`](../../pdfEngine/type-aliases/ChromiumResolution.md)\>

Defined in: src/export/LocalChromePdfProvider.ts:21

#### Parameters

##### configuredPath

`string`

#### Returns

`Promise`\<[`ChromiumResolution`](../../pdfEngine/type-aliases/ChromiumResolution.md)\>
