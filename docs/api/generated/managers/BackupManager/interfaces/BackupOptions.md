[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BackupOptions

# Interface: BackupOptions

Defined in: src/managers/BackupManager.ts:47

Backup options

## Properties

### compress?

> `optional` __compress?__: `boolean`

Defined in: src/managers/BackupManager.ts:49

***

### filename?

> `optional` __filename?__: `string`

Defined in: src/managers/BackupManager.ts:48

***

### requireComplete?

> `optional` __requireComplete?__: `boolean`

Defined in: src/managers/BackupManager.ts:57

Throw when any part of the backup failed, after saying so (#1723): a restore stages nothing without a whole copy of the live data.

***

### safetyBackup?

> `optional` __safetyBackup?__: `boolean`

Defined in: src/managers/BackupManager.ts:59

This is a restore's backup of the live data (#1892 D2); handed to every manager as `safetyBackup`.

***

### skipCleanup?

> `optional` __skipCleanup?__: `boolean`

Defined in: src/managers/BackupManager.ts:55

Leave retention for the next backup (#1723). The backup a restore takes
of the live data first sets it, so that backup can never prune the very
backup being restored.
