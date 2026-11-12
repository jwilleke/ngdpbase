[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupDocument](../README.md) / verifyBackupOffThread

# Function: verifyBackupOffThread()

> __verifyBackupOffThread__(`bytes`, `backupKey`, `name`, `timeoutMs`): `Promise`\<[`VerifiedBackup`](../interfaces/VerifiedBackup.md)\>

Defined in: src/utils/backupDocument.ts:89

Read a backup document back on a worker thread (#1563): rejects, naming
why, when it does not decrypt (a wrong key, a changed byte, a bad tag), does
not decompress, does not parse, or is not a backup document.

## Parameters

### bytes

`Buffer`

### backupKey

`string`

### name

`string`

### timeoutMs

`number`

## Returns

`Promise`\<[`VerifiedBackup`](../interfaces/VerifiedBackup.md)\>
