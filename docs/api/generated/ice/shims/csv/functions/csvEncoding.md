[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/csv](../README.md) / csvEncoding

# Function: csvEncoding()

> __csvEncoding__(`bytes`): `object`

Defined in: src/ice/shims/csv.ts:185

How a CSV is read and written back for cleaning (#2149), so its bytes stay
its own: UTF-16 with a byte-order mark as UTF-16; valid UTF-8 as UTF-8;
anything else (Latin-1, Windows-1252 and the like) one byte to one
character and back, which round-trips every byte exactly. The characters
cleaning looks for (`, " < > = + - @`, tab, line ends) are ASCII, the same
byte in each of these.

## Parameters

### bytes

`Buffer`

## Returns

`object`

### encode

> __encode__: (`text`) => `Buffer`

#### Parameters

##### text

`string`

#### Returns

`Buffer`

### text

> __text__: `string`
