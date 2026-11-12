[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sniffMime](../README.md) / resolveUploadMime

# Function: resolveUploadMime()

> __resolveUploadMime__(`bytes`, `declared`): `string`

Defined in: src/utils/sniffMime.ts:46

The type an upload is stored and served as. The bytes decide when they are
recognisable; a claim of a recognisable type the bytes do not bear out
becomes `application/octet-stream`; anything else keeps its declared type,
since nothing here can check it (a .docx, a plain text file).

## Parameters

### bytes

`Buffer`

### declared

`string` \| `undefined`

## Returns

`string`
