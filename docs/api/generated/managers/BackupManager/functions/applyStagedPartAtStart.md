[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / applyStagedPartAtStart

# Function: applyStagedPartAtStart()

> __applyStagedPartAtStart__(`engine`, `manager`, `options`): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BackupManager.ts:292

Put `manager`'s part of a staged site restore in place, at start, before
it reads its data (#1876, #1986): when the whole restore is there to
apply, each live path steps aside as `<live>.pre-restore` and the staged
copy takes its name; otherwise its staged files are set aside as
`*.incomplete`. The part is marked in BackupManager's record either way.
For a manager whose restore is staged by its own `restore()` (the
attachments, the audit log); declared folders and files go through
`applyStagedPartsAtStart`. A module function: most managers start before
BackupManager. Null when there was nothing to do.

## Parameters

### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

### manager

`string`

### options

[`StagedPartAtStartOptions`](../interfaces/StagedPartAtStartOptions.md)

## Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`
