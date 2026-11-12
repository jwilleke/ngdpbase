[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceUpload

# Interface: IceUpload

Defined in: src/ice/types.ts:475

One file handed to the engine. A `.zip` is unpacked by the engine.

## Properties

### archive?

> `optional` __archive?__: [`IceArchiveView`](IceArchiveView.md)

Defined in: src/ice/types.ts:486

The archive the engine unpacked this file from (#2118); set by the engine, never by a caller.

***

### bytes

> __bytes__: `Buffer`

Defined in: src/ice/types.ts:477

***

### givenName?

> `optional` __givenName?__: `string`

Defined in: src/ice/types.ts:484

The name the user gave what this file becomes (#2130). For a file
uploaded on its own; a zip's files keep their own names (the engine
drops it on a zip). Checked by the engine against the receiver's `names`.

***

### mediaType?

> `optional` __mediaType?__: `string`

Defined in: src/ice/types.ts:478

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:476
