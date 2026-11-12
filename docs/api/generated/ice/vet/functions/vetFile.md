[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/vet](../README.md) / vetFile

# Function: vetFile()

> __vetFile__(`shims`, `upload`): `Promise`\<[`IceVetResult`](../../types/interfaces/IceVetResult.md)\>

Defined in: src/ice/vet.ts:44

Vet one file (#2149). `shims` are the enabled ones. Throws
[IceVetRefused](../classes/IceVetRefused.md) when the cleaning shim fails: a file that could not
be checked is not kept.

## Parameters

### shims

readonly [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

### upload

[`IceUpload`](../../types/interfaces/IceUpload.md)

## Returns

`Promise`\<[`IceVetResult`](../../types/interfaces/IceVetResult.md)\>
