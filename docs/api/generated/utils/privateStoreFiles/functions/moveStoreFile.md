[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / moveStoreFile

# Function: moveStoreFile()

> __moveStoreFile__(`fromFile`, `toFile`, `fromIO`, `toIO`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreFiles.ts:258

Move one store file — a page's footnotes (#1839) — through each side's I/O,
as [moveStoreFolder](moveStoreFolder.md) moves a folder: read as its source stores it,
written as its destination does, so a file moved into a sealed vault is
sealed there and one moved out is opened. Two plain sides are a plain move.
The destination is written (atomically) before the source is removed.

## Parameters

### fromFile

`string`

### toFile

`string`

### fromIO

[`StoreFileIO`](../interfaces/StoreFileIO.md)

### toIO

[`StoreFileIO`](../interfaces/StoreFileIO.md)

## Returns

`Promise`\<`void`\>
