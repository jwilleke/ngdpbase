[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/ChromeServicePdfProvider](../README.md) / gotenbergFields

# Function: gotenbergFields()

> __gotenbergFields__(`options`): \[`string`, `string`\][]

Defined in: src/export/ChromeServicePdfProvider.ts:73

The form fields for one render. Every margin is sent, `0` when the caller
set none, because Gotenberg's own default margin is not zero and a local
render's is.

## Parameters

### options

[`ResolvedPdfOptions`](../../pdfEngine/interfaces/ResolvedPdfOptions.md)

The validated options

## Returns

\[`string`, `string`\][]
