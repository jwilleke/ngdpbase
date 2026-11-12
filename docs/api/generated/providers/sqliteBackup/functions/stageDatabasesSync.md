[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / stageDatabasesSync

# Function: stageDatabasesSync()

> __stageDatabasesSync__(`Database`, `stages`, `backupKey`): [`StageOutcome`](../interfaces/StageOutcome.md)

Defined in: src/providers/sqliteBackup.ts:233

Stage a restore: each backup file is opened under the backup key,
integrity-checked, and copied into `<live>.staged` under the target
database's key, which is then opened and checked too. All or nothing: if
any database fails, every staged file is removed and the error names it.
Live files are never touched.

## Parameters

### Database

`DatabaseConstructor`

### stages

[`DatabaseStage`](../interfaces/DatabaseStage.md)[]

### backupKey

`string`

## Returns

[`StageOutcome`](../interfaces/StageOutcome.md)
