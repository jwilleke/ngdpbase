[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/attachmentFilesBackup](../README.md) / stageAttachmentFiles

# Function: stageAttachmentFiles()

> __stageAttachmentFiles__(`places`, `readArchive`, `data`, `metadataJson`, `siteRestore`): `Promise`\<\{ `skippedVaults`: `string`[]; \}\>

Defined in: src/providers/attachmentFilesBackup.ts:185

Stage the attachment files from a backup for the next start, and record
the part in the site restore. All or nothing: on any failure every staged
path is removed and nothing is recorded.

## Parameters

### places

[`AttachmentFilePlaces`](../interfaces/AttachmentFilePlaces.md)

### readArchive

(`manager`, `archive`, `keyFingerprint`) => `object`

### data

[`AttachmentFilesBackupData`](../interfaces/AttachmentFilesBackupData.md)

### metadataJson

`string`

### siteRestore

[`SiteRestoreStaging`](../../../managers/BaseManager/interfaces/SiteRestoreStaging.md)

## Returns

`Promise`\<\{ `skippedVaults`: `string`[]; \}\>

the vaults the backup holds that this site doesn't have (not staged).
