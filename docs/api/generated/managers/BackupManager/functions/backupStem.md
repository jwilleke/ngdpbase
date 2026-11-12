[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / backupStem

# Function: backupStem()

> __backupStem__(`filename`): `string`

Defined in: src/managers/BackupManager.ts:158

A backup document's filename without `.json.gz` / `.json` (#1723). A
manager's own files beside the document are named `<stem>.<name>.db` (a
database, #1723) or `<stem>.<part>.tar` (a folder of files, #1876), and are
pruned and downloaded with it.

## Parameters

### filename

`string`

## Returns

`string`
