[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/PdfProvider](../README.md) / NonePdfProvider

# Class: NonePdfProvider

Defined in: src/export/PdfProvider.ts:51

`none`: PDF export is off. Also stands in for a provider name that is not
one, so a typo is reported the same way — unavailable, with the reason.

## Implements

- [`PdfProvider`](../interfaces/PdfProvider.md)

## Constructors

### Constructor

> __new NonePdfProvider__(`reason?`): `NonePdfProvider`

Defined in: src/export/PdfProvider.ts:54

#### Parameters

##### reason?

`string` = `'ngdpbase.export.pdf.provider is none: set it to local-chrome or chrome-service'`

#### Returns

`NonePdfProvider`

## Properties

### name

> `readonly` __name__: `"none"`

Defined in: src/export/PdfProvider.ts:52

#### Implementation of

[`PdfProvider`](../interfaces/PdfProvider.md).[`name`](../interfaces/PdfProvider.md#name)

## Methods

### render()

> __render__(): `Promise`\<[`PdfRendered`](../interfaces/PdfRendered.md)\>

Defined in: src/export/PdfProvider.ts:56

#### Returns

`Promise`\<[`PdfRendered`](../interfaces/PdfRendered.md)\>

#### Implementation of

[`PdfProvider`](../interfaces/PdfProvider.md).[`render`](../interfaces/PdfProvider.md#render)
