[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/assetMetadataTags](../README.md) / normalizeExifDate

# Function: normalizeExifDate()

> __normalizeExifDate__(`input`): `string`

Defined in: src/utils/assetMetadataTags.ts:38

Normalize a user-supplied timestamp to ExifTool's `YYYY:MM:DD HH:MM:SS`
write format.

Accepts `YYYY-MM-DD HH:MM[:SS]` and ISO-8601 `YYYY-MM-DDTHH:MM[:SS]`; a
date-only value gets `00:00:00`.

Rejects out-of-range parts rather than letting `Date` roll them over — a
typo'd `2026-02-31` would otherwise be silently written as 3 March, which is
worse than an error because the user believes the date they typed.

## Parameters

### input

`string`

User-supplied timestamp

## Returns

`string`

ExifTool-format timestamp

## Throws

Error on any other shape, or on out-of-range date parts
