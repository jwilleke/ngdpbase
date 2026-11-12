[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / PdfUnavailableError

# Class: PdfUnavailableError

Defined in: src/export/pdfEngine.ts:86

No PDF engine: `playwright-core` is not installed, no Chromium was found, or
it could not start. An add-on catches it by `code` (it cannot import core
values) and falls back to HTML.

## Extends

- `Error`

## Constructors

### Constructor

> __new PdfUnavailableError__(`message`, `options?`): `PdfUnavailableError`

Defined in: src/export/pdfEngine.ts:88

#### Parameters

##### message

`string`

##### options?

`ErrorOptions`

#### Returns

`PdfUnavailableError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` __code__: `"PDF_UNAVAILABLE"` = `'PDF_UNAVAILABLE'`

Defined in: src/export/pdfEngine.ts:87
