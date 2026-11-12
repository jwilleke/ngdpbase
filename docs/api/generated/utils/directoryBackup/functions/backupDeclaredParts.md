[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / backupDeclaredParts

# Function: backupDeclaredParts()

> __backupDeclaredParts__(`manager`, `declared`, `options`): `Promise`\<[`DeclaredPartsBackup`](../interfaces/DeclaredPartsBackup.md)\>

Defined in: src/utils/directoryBackup.ts:118

Back up a manager's declared parts beside the document BackupManager is
writing. Throws outside BackupManager: the files go beside a document,
never into it. A part that fails throws, and the manager's entry is then
an error, as when its own `backup()` throws.

## Parameters

### manager

`string`

### declared

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

### options

[`ManagerBackupOptions`](../../../managers/BaseManager/interfaces/ManagerBackupOptions.md) \| `undefined`

## Returns

`Promise`\<[`DeclaredPartsBackup`](../interfaces/DeclaredPartsBackup.md)\>
