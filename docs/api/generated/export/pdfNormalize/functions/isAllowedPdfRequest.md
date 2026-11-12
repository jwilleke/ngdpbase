[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/pdfNormalize](../README.md) / isAllowedPdfRequest

# Function: isAllowedPdfRequest()

> __isAllowedPdfRequest__(`url`): `boolean`

Defined in: src/export/pdfNormalize.ts:52

Whether the render may load a URL: only `data:` URIs (#1974). Everything
else — http(s), file, ftp, blob, websockets — is refused, so a PDF is made
from the HTML it was given and nothing else, and rendering cannot be used to
reach the network or the server's files.

## Parameters

### url

`string`

The URL the page asked for

## Returns

`boolean`
