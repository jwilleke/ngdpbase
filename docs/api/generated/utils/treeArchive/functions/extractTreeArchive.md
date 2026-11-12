[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/treeArchive](../README.md) / extractTreeArchive

# Function: extractTreeArchive()

> __extractTreeArchive__(`archive`, `dest`, `options?`): `Promise`\<\{ `bytes`: `number`; `files`: `number`; \}\>

Defined in: src/utils/treeArchive.ts:142

Extract `archive` into `dest`, which is emptied first, streamed.
`select(relative)` picks the entries to extract (default: all). Refuses —
removing `dest` — an entry that is not a file or a folder, an absolute
path, or one that climbs out (`..`).

## Parameters

### archive

`string`

### dest

`string`

### options?

#### backupKey?

`string`

#### select?

(`relative`) => `boolean`

#### strip?

`number`

## Returns

`Promise`\<\{ `bytes`: `number`; `files`: `number`; \}\>
