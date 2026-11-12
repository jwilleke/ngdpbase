[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runExport](../README.md) / runExportChain

# Function: runExportChain()

> __runExportChain__(`items`, `chain`, `tools`, `settings`, `zipName?`): `Promise`\<[`IceItem`](../../types/interfaces/IceItem.md)\>

Defined in: src/ice/runExport.ts:128

Run the source's items through the chain, each shim's output the next
one's input, and return the file the last shim made. What came before
travels with each item while a shim keeps the count: earlier metadata
under later, as an import's chain does.

Items that are already `file`s skip the chain and join what it makes. One
file is returned as it is; several, or any when `zipName` is given, are
packed into `<zipName>.zip` (`export.zip` by default), each under its own
name, a repeated name made unique. The zip is held to `maxBytes` too.

## Parameters

### items

[`IceItem`](../../types/interfaces/IceItem.md)[]

### chain

readonly [`RegisteredShim`](../../types/interfaces/RegisteredShim.md)[]

### tools

(`shim`) => [`ExportShimTools`](../../types/interfaces/ExportShimTools.md)

### settings

[`IceExportSettings`](../interfaces/IceExportSettings.md)

### zipName?

`string`

## Returns

`Promise`\<[`IceItem`](../../types/interfaces/IceItem.md)\>

## Throws

IceExportFailed when a step holds more than `maxBytes`, a shim
  makes something other than what it declares, or the end is no file
