[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BackupHealth

# Interface: BackupHealth

Defined in: src/managers/BackupManager.ts:495

Whether backups are working, as Admin → Backup and the /admin dashboard show it (#1563).

## Properties

### autoBackup

> __autoBackup__: `boolean`

Defined in: src/managers/BackupManager.ts:499

Automatic backups are on and scheduled.

***

### failure

> __failure__: [`BackupFailure`](BackupFailure.md) \| `null`

Defined in: src/managers/BackupManager.ts:505

The backup that failed, until one succeeds.

***

### fault

> __fault__: `string` \| `null`

Defined in: src/managers/BackupManager.ts:511

The outage, in one line, while backups are not working; null when they are.

***

### freeBytes

> __freeBytes__: `number` \| `null`

Defined in: src/managers/BackupManager.ts:503

Free bytes at the backup destination, or null when it can't be told.

***

### lastGood

> __lastGood__: \{ `at`: `string`; `filename`: `string`; `location`: `string`; `size`: `number`; \} \| `null`

Defined in: src/managers/BackupManager.ts:497

The newest backup in the backup directory that is not a failed one: when, how big (with the files beside it), where.

***

### nextRun

> __nextRun__: `string` \| `null`

Defined in: src/managers/BackupManager.ts:501

The next automatic backup, ISO 8601, or null.

***

### stale

> __stale__: `boolean`

Defined in: src/managers/BackupManager.ts:509

No good backup within `staleAfterMs`, or none at all.

***

### staleAfterMs

> __staleAfterMs__: `number`

Defined in: src/managers/BackupManager.ts:507

How long the site may go without a good backup before that is an outage, in ms.
