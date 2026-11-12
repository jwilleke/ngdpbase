[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / providers/FileJobStateProvider

# providers/FileJobStateProvider

Scheduled-job state as files in FAST_STORAGE (#1714). See `jobState.ts`.

  <root>/state/<jobId>.json              last slot done, next slot, current run
  <root>/runs/<jobId>.json               run history, newest first, capped
  <root>/checkpoints/<jobId>/<runId>.json
  <root>/locks/<jobId>@<slot>.lock       { owner, expiresAt }

Every write is atomic and flushed (temp file, fsync, rename), so a crash
mid-write leaves the previous file whole. A lock is created exclusively:
of any servers racing for a slot, the one whose create lands wins. An
expired lock is stolen by renaming it aside and creating a fresh one; the
rename succeeds for one stealer only. Renewal is the holder's job, well
inside the lock's lifetime, so a live holder is never stolen from.

Refuses to start on NFS or SMB: exclusive create and rename are what the
locks rest on, and network filesystems do not promise them across clients.

## Classes

- [default](classes/default.md)

## Interfaces

- [FileJobStateOptions](interfaces/FileJobStateOptions.md)
