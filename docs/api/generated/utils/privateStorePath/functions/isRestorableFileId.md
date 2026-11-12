[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / isRestorableFileId

# Function: isRestorableFileId()

> __isRestorableFileId__(`id`): `boolean`

Defined in: src/utils/privateStorePath.ts:299

Whether `id` has the shape a store gives a file (`crypto.randomUUID()`), so
a takeout's file can be stored under it again (#2188). Anything else, a
path or a pool's content hash among them, is never reused as a file name.

## Parameters

### id

`string`

## Returns

`boolean`
