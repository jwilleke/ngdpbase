[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/imageTransform](../README.md) / parseSize

# Function: parseSize()

> __parseSize__(`size`): \{ `height`: `number`; `width`: `number`; \} \| `null`

Defined in: src/utils/imageTransform.ts:130

Parse a size string of the form "WxH" (e.g. "300x300", "150x150").

## Parameters

### size

`string`

## Returns

\{ `height`: `number`; `width`: `number`; \} \| `null`

`{ width, height }` on success, or `null` if the string is malformed.
