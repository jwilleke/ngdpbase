[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceVetResult

# Interface: IceVetResult

Defined in: src/ice/types.ts:219

A file after the engine's vetting (#2149): its type read from its bytes,
and, when its format's shim found something to clean, the cleaned bytes
and what was removed. The caller keeps `bytes`, never the bytes it sent.

## Properties

### bytes

> __bytes__: `Buffer`

Defined in: src/ice/types.ts:221

***

### cleanedBy?

> `optional` __cleanedBy?__: `string`

Defined in: src/ice/types.ts:227

The shim that cleaned it, when one did.

***

### mediaType

> __mediaType__: `string`

Defined in: src/ice/types.ts:223

From the bytes when they show it (#1624), else the declared or extension type.

***

### name

> __name__: `string`

Defined in: src/ice/types.ts:220

***

### removed

> __removed__: [`IceWarning`](IceWarning.md)[]

Defined in: src/ice/types.ts:225

What cleaning removed, one note per kind; empty when nothing was.
