---
name: BackupManager
description: "Writes a site backup from every manager's backup(), keeps and prunes them, and stages restores — the databases from Admin → Backup, and the staged site restore"
dateModified: '2026-10-19'
category: managers
code: src/managers/BackupManager.ts
---

# BackupManager

__Module:__ `src/managers/BackupManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Guide:__ [Backup and restore guide](../guides/backup-restore-guide.md) — the one source for what a backup holds, what restores, and the gaps. This page is the API.

## What it does

BackupManager asks every registered manager for its `backup()`, writes the answers as one gzipped JSON document, and keeps the files the managers write beside it with it. It does not know what any manager's data is: each owner backs up and restores its own (Manager-SOT).

## Backup

`createBackup(ctx, options)` returns the document's path.

- `ctx` is mandatory: the request's subject, or the schedule's job context. A successful backup records `backup-create`.
- Each manager's `backup(options)` gets `{ ctx, directory, stem }` (`ManagerBackupOptions`): who asked, the backup directory, and the document's filename without `.json.gz`. A manager whose data is too large or not JSON writes its own files into `directory`, named `<stem>.<name>.db` (a database, `DatabaseManager`, #1723) or `<stem>.<part>.tar` (a folder of files, #1876), and names them in its entry. They are listed, downloaded and pruned with the document (`isCompanionOf`); a backup whose document is never written removes the files it made.
- A manager that throws gets `{ error, timestamp }` in its slot; one that missed a part lists it in `warnings`. The backup is still written, and admins get "A backup is incomplete".
- Options: `filename`, `compress` (default true), `skipCleanup`, `requireComplete` (throw after notifying when any part failed), `safetyBackup` (this is a restore's backup of the live data, #1892).
- Retention: after each backup the oldest beyond `ngdpbase.backup.max-backups` are removed with their files (`cleanupOldBackups`).
- Automatic backups are the scheduled job `backup.auto` (#1720): `ngdpbase.backup.auto-backup`, `-time` (`HH:MM`, server time zone) and `-days`.

## Stored backups

- `listBackups()` — the documents, newest first.
- `listStoredBackups()` / `findStoredBackup(filename)` — each with `databases` (its `.db` files by name) and `parts` (its `.tar` files by part), and `totalSize`. A filename is only ever matched against this list, never used as a path.
- `backupArchive(filename)` — one backup as a streamed `.tar` of the document and every file beside it, read as the stream is consumed.

## Restore

`restoreFromFile(ctx, backupPath, options)` reads and validates the document, then:

- __Databases only__ (`managerFilter: ['DatabaseManager']`, what Admin → Backup does through `startRestore`): a complete backup of the live data, then `DatabaseManager` stages the databases for the next start ([DatabaseManager.md](DatabaseManager.md#backup-and-restore)).
- __A site restore__ (no filter, or a filter naming any other manager whose `restoreIsStaged()` is true): every such manager in the backup stages its part under one site restore manifest, `ngdpbase.backup.restore-manifest`, all or nothing, after a complete backup of the live data, and the next start applies every part or none. Refused when a site or database restore is already staged (unless `replaceStaged`), or when a staged part's backup slot is an error. Details in the [guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).
- Every other manager in the backup is then restored __live__ by its own `restore()`, a failure listed in `failed`, not rolled back. Nothing calls `restoreFromFile` that way today.

Each manager's `restore(data, options)` gets `{ ctx, directory, source, replaceStaged, safetyBackup, siteRestore }` (`ManagerRestoreOptions`).

Also:

- `startRestore(ctx, filename, { replace })` — Admin → Backup's databases restore: records `backup-restore` / `backup-restore-replace` first (refuse), then runs in the background and notifies admins. Refused while a site restore is staged.
- `getStagedSiteRestore()` — the staged site restore manifest, or null.
- `cancelStagedSiteRestore(ctx)` — records `backup-restore-cancel` (refuse), then removes every staged file and the manifest. Not on Admin → Backup yet.
- At start (it starts last) BackupManager tells admins what the start did with a staged site restore: applied, not applied, or applied only in part.

## Configuration

| Key | Default | |
| --- | --- | --- |
| `ngdpbase.backup.directory` | `${SLOW_STORAGE}/backups` | where backups are written |
| `ngdpbase.backup.provider` | `filebackupprovider` | the storage provider (the only one) |
| `ngdpbase.backup.max-backups` | `10` | retention |
| `ngdpbase.backup.auto-backup`, `-time`, `-days` | `false`, `02:00`, `daily` | automatic backups |
| `ngdpbase.backup.restore-manifest` | `${FAST_STORAGE}/site-restore.json` | the staged site restore's record (#1876) |

`ngdpbase.backup.compress` and `ngdpbase.backup.auto-backup-interval` are in the default config, but nothing reads them.

## Related

- [Backup and restore guide](../guides/backup-restore-guide.md)
- [DatabaseManager](DatabaseManager.md#backup-and-restore), [AttachmentManager](AttachmentManager.md#backup-and-restore), [RoleManager](RoleManager.md#backup-and-restore)
- [BackupManager-Complete-Guide.md](BackupManager-Complete-Guide.md) (older; the guide above wins where they differ)
