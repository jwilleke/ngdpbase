[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / stageFilePart

# Function: stageFilePart()

> __stageFilePart__(`manager`, `file`, `data`, `options`, `__namedParameters`): `Promise`\<`void`\>

Defined in: src/utils/directoryBackup.ts:274

Stage one file from a backup for the next start and record the swap: the
instance `.env`, BackupManager's own part.

## Parameters

### manager

`string`

### file

`string`

### data

[`BackupPartRecord`](../../../managers/BaseManager/interfaces/BackupPartRecord.md)

### options

[`ManagerRestoreOptions`](../../../managers/BaseManager/interfaces/ManagerRestoreOptions.md) \| `undefined`

### \_\_namedParameters

#### whenAbsent

`string`

## Returns

`Promise`\<`void`\>
