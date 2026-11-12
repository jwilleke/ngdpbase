[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/LocalChromePdfProvider](../README.md) / LocalChromePdfProvider

# Class: LocalChromePdfProvider

Defined in: src/export/LocalChromePdfProvider.ts:24

## Implements

- [`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md)

## Constructors

### Constructor

> __new LocalChromePdfProvider__(`chromiumPath`, `deps?`): `LocalChromePdfProvider`

Defined in: src/export/LocalChromePdfProvider.ts:31

#### Parameters

##### chromiumPath

`string`

The configured Chromium ('' = find one)

##### deps?

[`LocalChromeDeps`](../interfaces/LocalChromeDeps.md) = `{}`

Test hooks

#### Returns

`LocalChromePdfProvider`

## Properties

### name

> `readonly` __name__: `"local-chrome"`

Defined in: src/export/LocalChromePdfProvider.ts:25

#### Implementation of

[`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md).[`name`](../../PdfProvider/interfaces/PdfProvider.md#name)

## Methods

### render()

> __render__(`__namedParameters`): `Promise`\<[`PdfRendered`](../../PdfProvider/interfaces/PdfRendered.md)\>

Defined in: src/export/LocalChromePdfProvider.ts:33

#### Parameters

##### \_\_namedParameters

[`PdfRenderRequest`](../../PdfProvider/interfaces/PdfRenderRequest.md)

#### Returns

`Promise`\<[`PdfRendered`](../../PdfProvider/interfaces/PdfRendered.md)\>

#### Implementation of

[`PdfProvider`](../../PdfProvider/interfaces/PdfProvider.md).[`render`](../../PdfProvider/interfaces/PdfProvider.md#render)
