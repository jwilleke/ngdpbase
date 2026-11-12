[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runExport](../README.md) / exportChains

# Function: exportChains()

> __exportChains__(`shims`, `kind`, `maxChainDepth`): `Map`\<`string`, [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]\>

Defined in: src/ice/runExport.ts:63

The formats that can be made from items of this kind: for each `out`
shim that makes a file, the shortest chain of `out` shims that reaches it
from `kind`, at most `maxChainDepth` long. Shims are tried in registration
order, so between two chains of one length the first registered wins.

## Parameters

### shims

readonly [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

### kind

`string`

### maxChainDepth

`number`

## Returns

`Map`\<`string`, [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]\>

The file-making shim's id → the chain, ending with it
