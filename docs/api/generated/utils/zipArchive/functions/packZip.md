[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/zipArchive](../README.md) / packZip

# Function: packZip()

> __packZip__(`entries`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/utils/zipArchive.ts:93

A zip archive of the given entries, as one Buffer.

Entries are deflated when that makes them smaller — markdown compresses well,
and a phone on mobile data is the expected destination — and stored as-is
when it does not, which is the usual outcome for photos and other media.

## Parameters

### entries

readonly [`ZipEntry`](../type-aliases/ZipEntry.md)[]

## Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>
