---
name: SqliteJobStateProvider
description: Scheduled-job state, run history, checkpoints and slot locks in the application database (job_state, job_runs, job_checkpoints, job_leases); lock by one conditional write (#1714)
dateModified: '2026-10-08'
category: providers
code: src/providers/SqliteJobStateProvider.ts
---

# SqliteJobStateProvider

__Module:__ `src/providers/SqliteJobStateProvider.ts`
__Implements:__ `JobStateProvider` (`src/providers/jobState.ts`)

The `sqlite` backend for scheduled jobs ([#1611](https://github.com/jwilleke/ngdpbase/issues/1611)). Chosen by `selectJobStateBackend` when `ngdpbase.jobs.state.provider` is `sqlite`, or `auto` with the application database open.

- Uses the connection from `DatabaseManager.getHandle()`; never a database file of its own. Encrypted when the database is (SQLCipher, `NGDPBASE_DATABASE_KEY`).
- Tables from the core migration ledger, `databaseMigrations.ts` id `20261008180000`: `job_state`, `job_runs`, `job_checkpoints`, `job_leases`.
- History is trimmed to the limit in the same transaction that records a run.
- A lock is a `job_leases` row taken by one `INSERT … ON CONFLICT DO UPDATE … WHERE` expired or own: exactly one racing server sees its row change.

See also [FileJobStateProvider](FileJobStateProvider.md).
