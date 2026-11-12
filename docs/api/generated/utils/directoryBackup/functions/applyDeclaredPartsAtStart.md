[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / applyDeclaredPartsAtStart

# Function: applyDeclaredPartsAtStart()

> __applyDeclaredPartsAtStart__(`manager`, `declared`, `configManager`): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/utils/directoryBackup.ts:285

Put a staged restore of a manager's declared parts in place, at start,
before the manager reads them. Only the paths it declares may be
replaced, whatever the manifest says; a staged copy no committed restore
names (an interrupted staging) is set aside. Loud when something was
staged but not applied. Null when there was nothing to do.

## Parameters

### manager

`string`

### declared

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

### configManager

\{ `getResolvedDataPath`(`key`, `def`): `string`; \} \| `null` \| `undefined`

## Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`
