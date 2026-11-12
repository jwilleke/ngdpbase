[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [export/ChromeServicePdfProvider](../README.md) / multipartBody

# Function: multipartBody()

> __multipartBody__(`html`, `fields`, `boundary`): `Buffer`

Defined in: src/export/ChromeServicePdfProvider.ts:96

A `multipart/form-data` body: the fields, then the document as `files`
named `index.html` (the name Gotenberg's HTML route requires).

## Parameters

### html

`string`

The document

### fields

\[`string`, `string`\][]

Name and value pairs

### boundary

`string`

The part boundary

## Returns

`Buffer`
