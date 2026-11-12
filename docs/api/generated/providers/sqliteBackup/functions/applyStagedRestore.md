[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / applyStagedRestore

# Function: applyStagedRestore()

> __applyStagedRestore__(`applicationFile`, `allowed`): [`ApplyOutcome`](../interfaces/ApplyOutcome.md) \| `null`

Defined in: src/providers/sqliteBackup.ts:349

Apply a staged restore at start, before any database opens. Each live file,
with its `-wal` and `-shm`, steps aside as `*.pre-restore` (`-wal`/`-shm`
beside it, so the kept copy still opens as it was), and the staged file
takes its name. A rename, never a write into a live database.

All or nothing: if any database the manifest names is not staged, nothing
is applied; what is staged is renamed `*.incomplete`, so it is neither
applied nor retried. A staged file with no manifest (staging was
interrupted) is set aside the same way. `allowed` says which live paths may
be replaced, so a tampered manifest cannot rename an arbitrary file.

## Parameters

### applicationFile

`string`

### allowed

(`live`) => `boolean`

## Returns

[`ApplyOutcome`](../interfaces/ApplyOutcome.md) \| `null`
