[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BackupFailure

# Interface: BackupFailure

Defined in: src/managers/BackupManager.ts:464

A backup that failed (#1563), as kept in the health record until a backup succeeds.

## Properties

### at

> __at__: `string`

Defined in: src/managers/BackupManager.ts:466

When it failed, ISO 8601.

***

### filename?

> `optional` __filename?__: `string`

Defined in: src/managers/BackupManager.ts:470

The document that was written anyway (a backup with a part missing), so it is not counted as good.

***

### reason

> __reason__: `string`

Defined in: src/managers/BackupManager.ts:468

Why, in words an admin can act on.
