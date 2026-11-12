[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / convertChain

# Function: convertChain()

> __convertChain__(`shim`, `input`, `chain`, `spec`, `partial`, `skipped?`): `Promise`\<[`ChainLeaf`](../interfaces/ChainLeaf.md)[]\>

Defined in: src/ice/runImport.ts:201

Run a shim, then the shims after it (D9), until each item is done. What
came before travels with each item: earlier metadata under later, earlier
warnings first. Partial notes are collected into `partial`; a shim's note
that the file holds nothing to import on its own (#2118) into `skipped`.

## Parameters

### shim

[`RegisteredShim`](../../types/interfaces/RegisteredShim.md)

### input

[`IceItem`](../../types/interfaces/IceItem.md)

### chain

`string`[]

### spec

[`ChainSpec`](../interfaces/ChainSpec.md)

### partial

`string`[]

### skipped?

`string`[] = `[]`

## Returns

`Promise`\<[`ChainLeaf`](../interfaces/ChainLeaf.md)[]\>
