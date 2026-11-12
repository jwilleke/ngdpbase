[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / ExifCameraData

# Interface: ExifCameraData

Defined in: src/types/Schema.ts:93

Internal storage shape for image/video EXIF camera metadata.
schema.org's `exifData` is a Property array; we store this structured
shape internally and let the render mapper convert at JSON-LD time
(marked `⚠️` in docs/schemas.md).

## Properties

### exposureTime?

> `optional` __exposureTime?__: `string`

Defined in: src/types/Schema.ts:99

***

### fNumber?

> `optional` __fNumber?__: `string`

Defined in: src/types/Schema.ts:98

***

### focalLength?

> `optional` __focalLength?__: `string`

Defined in: src/types/Schema.ts:97

***

### iso?

> `optional` __iso?__: `number`

Defined in: src/types/Schema.ts:100

***

### lensModel?

> `optional` __lensModel?__: `string`

Defined in: src/types/Schema.ts:96

***

### make?

> `optional` __make?__: `string`

Defined in: src/types/Schema.ts:94

***

### model?

> `optional` __model?__: `string`

Defined in: src/types/Schema.ts:95
