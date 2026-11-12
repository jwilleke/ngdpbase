[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ShimAccepts

# Interface: ShimAccepts

Defined in: src/ice/types.ts:106

What a shim takes. A file matches by extension or media type; a chained input by kind.

## Properties

### extensions?

> `optional` __extensions?__: `string`[]

Defined in: src/ice/types.ts:108

Lower-case, with the dot: `['.xml']`.

***

### kinds?

> `optional` __kinds?__: `string`[]

Defined in: src/ice/types.ts:111

Kinds produced by another shim that this one reads (D9), e.g. `['html']`.

***

### mediaTypes?

> `optional` __mediaTypes?__: `string`[]

Defined in: src/ice/types.ts:109

## Methods

### canRead()?

> `optional` __canRead__(`input`): `boolean`

Defined in: src/ice/types.ts:117

"Can I read this?" (D7), on the content. When present it must answer yes
even for a file whose extension matches; it is also how a file with no
matching extension is claimed.

#### Parameters

##### input

[`IceItem`](IceItem.md)

#### Returns

`boolean`
