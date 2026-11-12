[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/videoPlayability](../README.md) / isDefinitelyUnplayable

# Function: isDefinitelyUnplayable()

> __isDefinitelyUnplayable__(`mimeType`, `videoCodec?`): `boolean`

Defined in: src/utils/videoPlayability.ts:92

True when this file cannot play in any browser, so the page should offer its
poster frame and a download instead of a player.

False means "worth trying" — NOT "will play". The template still handles a
runtime decode failure, because this deliberately does not guess about
ambiguous containers. See the module comment.

## Parameters

### mimeType

`string` \| `null` \| `undefined`

The item's MIME type. Non-video types answer `false`; they
  never reach the player branch, and claiming otherwise would make this
  function's answer meaningless for them.

### videoCodec?

`string` \| `null`

`metadata.videoCodec`, when the index has it. Absent on
  entries that predate the field, which is why its absence is never itself
  evidence of anything.

## Returns

`boolean`
