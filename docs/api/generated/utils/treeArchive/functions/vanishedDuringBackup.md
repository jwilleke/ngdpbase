[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/treeArchive](../README.md) / vanishedDuringBackup

# Function: vanishedDuringBackup()

> __vanishedDuringBackup__(`err`): `boolean`

Defined in: src/utils/treeArchive.ts:54

Whether a backup's read failed because the entry it was reading was
deleted meanwhile (#1563): a page, a version folder or a file removed
while the backup walked past it. That entry is skipped and counted, never
a failed backup — the site keeps running while it is backed up (#1213).
Every other error (EACCES, EIO, …) is a real failure and still fails.

## Parameters

### err

`unknown`

## Returns

`boolean`
