[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / providers/SqliteJobStateProvider

# providers/SqliteJobStateProvider

Scheduled-job state in the application database (#1714). See `jobState.ts`.

Uses the one connection `DatabaseManager.getHandle()` hands out — never a
database file of its own — so it is encrypted when the database is
(SQLCipher, `NGDPBASE_DATABASE_KEY`). The tables come from the core
migration ledger (`databaseMigrations.ts`, 20261008180000).

A lock is a row in `job_leases`, taken by one conditional write: insert it,
or overwrite it only when it has expired or already belongs to the caller.
SQLite runs that statement as one unit, so of any servers racing for a slot
exactly one sees its row change.

## Classes

- [default](classes/default.md)

## Interfaces

- [SqliteJobStateOptions](interfaces/SqliteJobStateOptions.md)

## Functions

- [runsStartedAfter](functions/runsStartedAfter.md)
