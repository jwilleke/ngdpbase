[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreFiles](../README.md) / moveStoreFolder

# Function: moveStoreFolder()

> __moveStoreFolder__(`fromDir`, `toDir`, `fromIO`, `toIO`): `Promise`\<`void`\>

Defined in: src/utils/privateStoreFiles.ts:222

Move a folder of store files — a page's history — from one place to another
through each side's I/O (#1836): every file is read as its source stores it
and written as its destination does, so history moved into a sealed vault
is sealed with that vault's DEK, history moved out of one is opened, and a
move between two sealed vaults is re-sealed. Two plain sides are a plain
rename, as before.

The copy is staged beside `toDir` and renamed into place only when every
file is written, so a failure leaves the source whole and no half history
at the destination. The source is removed last.

## Parameters

### fromDir

`string`

### toDir

`string`

### fromIO

[`StoreFileIO`](../interfaces/StoreFileIO.md)

### toIO

[`StoreFileIO`](../interfaces/StoreFileIO.md)

## Returns

`Promise`\<`void`\>
