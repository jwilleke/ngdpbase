[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / archiveTarget

# Function: archiveTarget()

> __archiveTarget__(`stem`, `part`): `object`

Defined in: src/utils/directoryBackup.ts:49

The name and key for one archive of a backup: encrypted under the backup
key when it is set (#1561), plain otherwise. BackupManager says, once per
backup, that a backup without the key is not encrypted.

## Parameters

### stem

`string`

### part

`string`

## Returns

`object`

### archive

> __archive__: `string`

### backupKey?

> `optional` __backupKey?__: `string`

### keyFingerprint?

> `optional` __keyFingerprint?__: `string`
