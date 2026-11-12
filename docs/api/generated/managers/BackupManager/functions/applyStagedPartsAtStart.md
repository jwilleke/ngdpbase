[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / applyStagedPartsAtStart

# Function: applyStagedPartsAtStart()

> __applyStagedPartsAtStart__(`engine`, `manager`, `declared`): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BackupManager.ts:255

Put a staged restore of a manager's declared folders and files in place,
at start, before it reads them (#1985). BackupManager's step: a manager
reaches it through `BaseManager.initialize()`, an add-on's folders through
AddonsManager before the add-on's `register()`. A module function, not a
method, because most managers start before BackupManager does; it needs
only the configuration, for the site restore manifest.

## Parameters

### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

### manager

`string`

### declared

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

## Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`
