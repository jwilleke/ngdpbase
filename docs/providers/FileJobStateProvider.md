---
name: FileJobStateProvider
description: Scheduled-job state, run history, checkpoints and slot locks as files in FAST_STORAGE; atomic fsynced writes, exclusive-create locks, refuses NFS/SMB (#1714)
dateModified: '2026-10-08'
category: providers
code: src/providers/FileJobStateProvider.ts
---

# FileJobStateProvider

__Module:__ `src/providers/FileJobStateProvider.ts`
__Implements:__ `JobStateProvider` (`src/providers/jobState.ts`)

The `file` backend for scheduled jobs ([#1611](https://github.com/jwilleke/ngdpbase/issues/1611)). Chosen by `selectJobStateBackend` when `ngdpbase.jobs.state.provider` is `file`, or `auto` with no application database open.

- Layout under its root: `state/<jobId>.json`, `runs/<jobId>.json` (newest first, capped at the history limit), `checkpoints/<jobId>/<runId>.json`, `locks/<jobId>@<slot>.lock`.
- Every write goes through `writeFileAtomic` with `fsync`: a crash mid-write leaves the previous file whole.
- A lock is created exclusively (hard-link publish), so one of any racing servers wins. An expired lock is renamed aside and re-created; one stealer's rename succeeds. The holder renews well inside the lock's lifetime.
- Refuses to start on NFS or SMB (`networkFilesystemAt`, shared with the SQLite refusal): exclusive create and rename are not guaranteed across clients there.

See also [SqliteJobStateProvider](SqliteJobStateProvider.md), which keeps the same contract in the application database.
