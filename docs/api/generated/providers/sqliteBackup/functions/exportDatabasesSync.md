[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / exportDatabasesSync

# Function: exportDatabasesSync()

> __exportDatabasesSync__(`Database`, `exports`, `backupKey`): [`ExportOutcome`](../interfaces/ExportOutcome.md)

Defined in: src/providers/sqliteBackup.ts:168

Write an encrypted copy of each database under `backupKey`. A database that
cannot be opened or copied is named in `failed`, its partial file removed;
the others are still written. A target that already exists is never
overwritten.

## Parameters

### Database

`DatabaseConstructor`

### exports

[`DatabaseExport`](../interfaces/DatabaseExport.md)[]

### backupKey

`string`

## Returns

[`ExportOutcome`](../interfaces/ExportOutcome.md)
