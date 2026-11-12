[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/treeArchive](../README.md) / listTreeArchive

# Function: listTreeArchive()

> __listTreeArchive__(`archive`, `onEntry`, `options?`): `Promise`\<`void`\>

Defined in: src/utils/treeArchive.ts:226

Every entry in an archive, plain or encrypted, read as a stream: what a
caller checks before extracting. `onEntry` gets each entry's path and type.

## Parameters

### archive

`string`

### onEntry

(`entry`) => `void`

### options?

#### backupKey?

`string`

## Returns

`Promise`\<`void`\>
