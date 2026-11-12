[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfNormalize](../README.md) / normalizePdf

# Function: normalizePdf()

> __normalizePdf__(`bytes`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: src/export/pdfNormalize.ts:30

The same bytes for the same document: no dates, no random `/ID`, a fixed
producer. The page content is not touched.

## Parameters

### bytes

`Uint8Array`

A PDF as Chromium wrote it

## Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

The normalised PDF
