[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / backupKeyFileText

# Function: backupKeyFileText()

> __backupKeyFileText__(`input`): `string`

Defined in: src/managers/BackupManager.ts:612

The backup key file (#2134): what it is, for which site, the key's
fingerprint, when it was saved (the server's local time), how to restore
with it, and the one `NGDPBASE_BACKUP_KEY=` line, written so the boot's
`.env` reader reads the key back exactly.

## Parameters

### input

#### fingerprint

`string`

#### key

`string`

#### saved

`string`

#### site

`string`

## Returns

`string`
