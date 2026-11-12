[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteMigrations](../README.md) / runMigrations

# Function: runMigrations()

> __runMigrations__(`db`, `registry`, `ledgerTable?`): [`MigrationReport`](../interfaces/MigrationReport.md)

Defined in: src/providers/sqliteMigrations.ts:64

`ledgerTable` names the table the applied ids are recorded in. A second database keeps its own
name (yourphr#784): a backup holding several databases' tables in one file splits them back BY
TABLE NAME on restore, and two tables called schema_migrations could not be told apart.

## Parameters

### db

`Database`

### registry

[`Migration`](../interfaces/Migration.md)[]

### ledgerTable?

`string` = `'schema_migrations'`

## Returns

[`MigrationReport`](../interfaces/MigrationReport.md)
