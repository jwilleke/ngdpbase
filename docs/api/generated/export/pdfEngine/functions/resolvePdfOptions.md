[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfEngine](../README.md) / resolvePdfOptions

# Function: resolvePdfOptions()

> __resolvePdfOptions__(`options`, `defaultFormat`): [`ResolvedPdfOptions`](../interfaces/ResolvedPdfOptions.md)

Defined in: src/export/pdfEngine.ts:101

Validate a caller's options and fill the defaults. Throws on anything
Chromium would misread, so a typo is an error rather than a different page.

## Parameters

### options

[`PdfOptions`](../interfaces/PdfOptions.md) \| `undefined`

The caller's options

### defaultFormat

`string`

`ngdpbase.export.pdf.page-size`

## Returns

[`ResolvedPdfOptions`](../interfaces/ResolvedPdfOptions.md)
