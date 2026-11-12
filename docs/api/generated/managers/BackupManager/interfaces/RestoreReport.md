[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / RestoreReport

# Interface: RestoreReport

Defined in: src/managers/BackupManager.ts:351

What a staged restore will not bring back, written when it is staged (#1876)
and read once it has been applied, for the critical notification: kept by
BackupManager beside the site restore manifest, as `<manifest>.report.json`.

## Properties

### backup

> __backup__: `string`

Defined in: src/managers/BackupManager.ts:355

When the backup was taken.

***

### jobRuns

> __jobRuns__: [`JobRunSince`](../../BackgroundJobManager/interfaces/JobRunSince.md)[]

Defined in: src/managers/BackupManager.ts:359

The job runs since the backup, read from the live job state when the restore was staged.

***

### notRestored

> __notRestored__: `string`[]

Defined in: src/managers/BackupManager.ts:357

The backup's parts that were not staged, by manager.

***

### source

> __source__: `string`

Defined in: src/managers/BackupManager.ts:353

***

### stagedBy?

> `optional` __stagedBy?__: `string`

Defined in: src/managers/BackupManager.ts:361

Who started the restore.

***

### version

> __version__: `1`

Defined in: src/managers/BackupManager.ts:352
