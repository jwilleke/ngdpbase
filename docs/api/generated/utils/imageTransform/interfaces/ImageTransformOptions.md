[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/imageTransform](../README.md) / ImageTransformOptions

# Interface: ImageTransformOptions

Defined in: src/utils/imageTransform.ts:17

Options for a single image transform operation.

## Properties

### fit?

> `optional` __fit?__: `"fill"` \| `"cover"` \| `"inside"` \| `"contain"`

Defined in: src/utils/imageTransform.ts:29

Resize fit mode (default: 'inside').
  inside   — preserve full image, letterbox to fit bounds
  cover    — crop to fill bounds exactly
  contain  — letterbox with background fill
  fill     — stretch to exact bounds (may distort)

***

### format?

> `optional` __format?__: `"jpeg"` \| `"webp"` \| `"png"`

Defined in: src/utils/imageTransform.ts:31

Output format (default: 'jpeg')

***

### height?

> `optional` __height?__: `number`

Defined in: src/utils/imageTransform.ts:21

Target height in pixels (omit to skip resizing)

***

### quality?

> `optional` __quality?__: `number`

Defined in: src/utils/imageTransform.ts:33

Compression quality 1–100 (default: 85; ignored for png)

***

### width?

> `optional` __width?__: `number`

Defined in: src/utils/imageTransform.ts:19

Target width in pixels (omit to skip resizing)
