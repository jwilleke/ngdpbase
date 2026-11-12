[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Asset](../README.md) / AssetMetadata

# Interface: AssetMetadata

Defined in: src/types/Asset.ts:85

Structured metadata bag for AssetRecord.

Typed fields cover the most common EXIF / IPTC / XMP values.
The index signature allows any provider-specific or custom field
to be stored without a type change ("custom field support").

## Indexable

> \[`key`: `string`\]: `unknown`

Provider-specific or custom metadata fields

## Properties

### audioCodec?

> `optional` __audioCodec?__: `string`

Defined in: src/types/Asset.ts:115

Audio codec (ExifTool AudioFormat / AudioCodec) — internal compatibility hint

***

### camera?

> `optional` __camera?__: [`AssetCamera`](AssetCamera.md)

Defined in: src/types/Asset.ts:87

Camera and capture settings (EXIF)

***

### captureDateField?

> `optional` __captureDateField?__: `string`

Defined in: src/types/Asset.ts:111

WHICH literal EXIF/QuickTime tag supplied `dateTimeOriginal` when
 captureDateSource is 'exif' (#864): 'DateTimeOriginal' | 'CreateDate' |
 'MediaCreateDate' | 'CreationDate'. Lets the Dawarich adapter apply its
 strict per-type date policy (photos require DateTimeOriginal proper;
 the other three are video container-creation fields). Absent on
 filename-derived or dateless items, and on index entries that predate
 this field (rescan populates it).

***

### captureDateSource?

> `optional` __captureDateSource?__: `"filename"` \| `"exif"`

Defined in: src/types/Asset.ts:103

Provenance of `dateTimeOriginal`: `'exif'` = read from EXIF/QuickTime
 tags; `'filename'` = parsed from the filename as a conservative fallback
 (#809). Absent when the item has no capture date at all. Lets consumers
 treat a filename-derived date as non-authoritative.

***

### colorSpace?

> `optional` __colorSpace?__: `string`

Defined in: src/types/Asset.ts:91

Colour space e.g. "srgb" (EXIF ColorSpace / sharp metadata)

***

### copyright?

> `optional` __copyright?__: `string`

Defined in: src/types/Asset.ts:93

Copyright notice (EXIF / IPTC Copyright)

***

### creator?

> `optional` __creator?__: `string`

Defined in: src/types/Asset.ts:96

Content creator / photographer (IPTC Creator / XMP Creator) —
 distinct from schema.org/author which records the uploader

***

### gps?

> `optional` __gps?__: [`AssetGPS`](AssetGPS.md)

Defined in: src/types/Asset.ts:89

Geographic location (EXIF GPS tags)

***

### orientation?

> `optional` __orientation?__: `number`

Defined in: src/types/Asset.ts:98

EXIF Orientation value (1–8)

***

### videoCodec?

> `optional` __videoCodec?__: `string`

Defined in: src/types/Asset.ts:113

Video/audio codec (ExifTool VideoCodec) — internal compatibility hint
