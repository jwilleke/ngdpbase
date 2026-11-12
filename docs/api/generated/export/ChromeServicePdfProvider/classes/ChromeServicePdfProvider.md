[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/ChromeServicePdfProvider](../README.md) / ChromeServicePdfProvider

# Class: ChromeServicePdfProvider

Defined in: src/export/ChromeServicePdfProvider.ts:114

## Implements

- [`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md)

## Constructors

### Constructor

> __new ChromeServicePdfProvider__(`settings`, `deps?`): `ChromeServicePdfProvider`

Defined in: src/export/ChromeServicePdfProvider.ts:117

#### Parameters

##### settings

[`ChromeServiceSettings`](../interfaces/ChromeServiceSettings.md)

##### deps?

[`ChromeServiceDeps`](../interfaces/ChromeServiceDeps.md) = `{}`

#### Returns

`ChromeServicePdfProvider`

## Properties

### name

> `readonly` __name__: `"chrome-service"`

Defined in: src/export/ChromeServicePdfProvider.ts:115

#### Implementation of

[`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md).[`name`](../../PdfProvider/interfaces/PdfProvider.md#name)

## Methods

### render()

> __render__(`__namedParameters`): `Promise`\<[`PdfRendered`](../../PdfProvider/interfaces/PdfRendered.md)\>

Defined in: src/export/ChromeServicePdfProvider.ts:119

#### Parameters

##### \_\_namedParameters

[`PdfRenderRequest`](../../PdfProvider/interfaces/PdfRenderRequest.md)

#### Returns

`Promise`\<[`PdfRendered`](../../PdfProvider/interfaces/PdfRendered.md)\>

#### Implementation of

[`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md).[`render`](../../PdfProvider/interfaces/PdfProvider.md#render)
