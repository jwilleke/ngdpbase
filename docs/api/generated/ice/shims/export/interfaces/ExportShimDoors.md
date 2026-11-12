[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/export](../README.md) / ExportShimDoors

# Interface: ExportShimDoors

Defined in: src/ice/shims/export.ts:27

The core doors the export shims call.

## Methods

### htmlToPdf()

> __htmlToPdf__(`ctx`, `html`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/ice/shims/export.ts:31

HTML → PDF (ExportManager.htmlToPdf), as the run's user.

#### Parameters

##### ctx

[`ActorContext`](../../../../context/ActorContext/type-aliases/ActorContext.md)

##### html

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### pdfAvailable()

> __pdfAvailable__(): `boolean`

Defined in: src/ice/shims/export.ts:33

Is a PDF provider chosen?

#### Returns

`boolean`

***

### renderDocument()

> __renderDocument__(`item`): `Promise`\<`string`\>

Defined in: src/ice/shims/export.ts:29

A complete HTML document for one NCM item (ExportManager's page document).

#### Parameters

##### item

[`IceItem`](../../../types/interfaces/IceItem.md)

#### Returns

`Promise`\<`string`\>
