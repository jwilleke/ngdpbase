[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/attachmentFilesBackup](../README.md) / backupAttachmentFiles

# Function: backupAttachmentFiles()

> __backupAttachmentFiles__(`places`, `archive`): `Promise`\<[`AttachmentFilesBackupOutcome`](../interfaces/AttachmentFilesBackupOutcome.md)\>

Defined in: src/providers/attachmentFilesBackup.ts:101

Write the attachment files beside the backup document: the pool, then every vault's. Never base64, never whole in memory.

## Parameters

### places

[`AttachmentFilePlaces`](../interfaces/AttachmentFilePlaces.md)

### archive

(`part`) => [`BackupArchiveTarget`](../../../managers/BaseManager/interfaces/BackupArchiveTarget.md)

## Returns

`Promise`\<[`AttachmentFilesBackupOutcome`](../interfaces/AttachmentFilesBackupOutcome.md)\>
