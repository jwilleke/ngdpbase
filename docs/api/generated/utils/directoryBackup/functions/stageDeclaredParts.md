[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / stageDeclaredParts

# Function: stageDeclaredParts()

> __stageDeclaredParts__(`manager`, `declared`, `entry`, `options`): `Promise`\<\{ `leftOut`: `string`[]; \}\>

Defined in: src/utils/directoryBackup.ts:222

Stage a manager's declared parts from its entry in a backup, for the next
start: each archive is extracted to `<path>.staged`, and the swaps are
recorded in the site restore together. Throws — staging nothing, and
removing what it extracted — outside a site restore, for a backup without
a part that is not optional, or for an archive that is missing, unsafe,
or under another key. Returns the parts the backup left out.

## Parameters

### manager

`string`

### declared

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

### entry

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md) \| `undefined`

### options

[`ManagerRestoreOptions`](../../../managers/BaseManager/interfaces/ManagerRestoreOptions.md) \| `undefined`

## Returns

`Promise`\<\{ `leftOut`: `string`[]; \}\>
