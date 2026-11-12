[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupDocument](../README.md) / readBackupDocument

# Function: readBackupDocument()

> __readBackupDocument__(`bytes`, `backupKey`, `name`, `options?`): `Promise`\<[`BackupDocument`](../interfaces/BackupDocument.md)\>

Defined in: src/utils/backupDocument.ts:41

The document in `bytes`, read as a restore reads it: an encrypted one only
under `backupKey`, gzip by its first bytes whatever the name says.

## Parameters

### bytes

`Buffer`

### backupKey

`string`

### name

`string`

the file's name, for the messages

### options?

#### validate?

`boolean`

check the shape (default true)

## Returns

`Promise`\<[`BackupDocument`](../interfaces/BackupDocument.md)\>
