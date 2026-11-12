[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/imageTransform](../README.md) / transformImage

# Function: transformImage()

> __transformImage__(`input`, `options`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/utils/imageTransform.ts:48

Transform an image using sharp.

Accepts either a Buffer (e.g. a freshly uploaded file) or an absolute
file path (e.g. a media-library file). Applies EXIF-based auto-rotation
before resizing so orientation is always correct regardless of camera model.

## Parameters

### input

`string` \| `Buffer`\<`ArrayBufferLike`\>

Image buffer or absolute path to the source file

### options

[`ImageTransformOptions`](../interfaces/ImageTransformOptions.md)

Resize / format options

## Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

- Transformed image as a Buffer

## Throws

- Re-throws sharp errors (caller should handle)
