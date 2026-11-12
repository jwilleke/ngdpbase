[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/attachmentFilesBackup](../README.md) / applyAttachmentFilesAtStart

# Function: applyAttachmentFilesAtStart()

> __applyAttachmentFilesAtStart__(`engine`, `places`): `Promise`\<[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`\>

Defined in: src/providers/attachmentFilesBackup.ts:271

Put staged attachment files in place, at start, before the metadata is
read: only the pool, its metadata file and vault attachment paths may be
replaced, whatever the manifest says.

## Parameters

### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

### places

[`AttachmentFilePlaces`](../interfaces/AttachmentFilePlaces.md)

## Returns

`Promise`\<[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`\>
