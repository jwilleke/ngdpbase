[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/videoFrame](../README.md) / extractVideoFrame

# Function: extractVideoFrame()

> __extractVideoFrame__(`filePath`, `atSeconds?`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/utils/videoFrame.ts:26

Extract a single video frame at the given timestamp as an MJPEG buffer.
Returns null on any error so the caller can fall back to the icon
placeholder without crashing the request.

## Parameters

### filePath

`string`

Absolute path to the source video file

### atSeconds?

`number` = `1`

Seek timestamp; defaults to 1 (the conventional poster
                 position — early enough to be quick, late enough to
                 usually skip the black opening frame)

## Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>
