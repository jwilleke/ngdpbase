[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/vet](../README.md) / cleanerFor

# Function: cleanerFor()

> __cleanerFor__(`shims`, `name`, `mediaType`, `bytesShowType`): [`RegisteredShim`](../../types/interfaces/RegisteredShim.md) \| `null`

Defined in: src/ice/vet.ts:31

The shim that cleans this file: one whose media types include the type the
bytes show; or, when the bytes show no type of their own (CSV, plain text),
one whose extensions include the file's. Its "can I read this?" must agree.

## Parameters

### shims

readonly [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

### name

`string`

### mediaType

`string`

### bytesShowType

`boolean`

## Returns

[`RegisteredShim`](../../types/interfaces/RegisteredShim.md) \| `null`
