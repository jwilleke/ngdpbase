---
name: BackupManager
description: "Writes a site backup from every manager's backup(), keeps and prunes them, and stages restores from Admin → Backup — the whole site, or the databases only"
dateModified: '2026-10-21'
category: managers
code: src/managers/BackupManager.ts
---

# BackupManager

__Module:__ `src/managers/BackupManager.ts`
__Extends:__ [BaseManager](BaseManager.md)
__Guide:__ [Backup and restore guide](../guides/backup-restore-guide.md) — the one source for what a backup holds, what restores, and the gaps. This page is the API.

## What it does

BackupManager asks every registered manager for its `backup()`, writes the answers as one gzipped JSON document — encrypted under `NGDPBASE_BACKUP_KEY` when it is set (#1561) — and keeps the files the managers write beside it with it. It does not know what any manager's data is: each owner backs up and restores its own (Manager-SOT).

## Backup

`createBackup(ctx, options)` returns the document's path.

- `ctx` is mandatory: the request's subject, or the schedule's job context. A successful backup records `backup-create`.
- With `NGDPBASE_BACKUP_KEY` set the document is `<timestamp>-ngdpbase-backup.json.gz.enc`, gzipped then encrypted (`src/utils/backupCrypto.ts`); without it `.json.gz`, in the clear. While the key is missing BackupManager is degraded as needing attention, not down (`BACKUP_KEY_MISSING` via `markNeedsAttention`, the dashboard's "Working, but needs your attention" section, #1946), checked at start and at each backup, and cleared once the key is set; admins get one notification, "Backups are not encrypted", the first time only — deduplicated by its title among the stored notifications, which persist across restarts and keep a dismissed one (as `pageMetadataMissing` does) (operator, #1912).
- Each manager's `backup(options)` gets `{ ctx, directory, stem }` (`ManagerBackupOptions`): who asked, the backup directory, and the document's filename without `.json.gz` / `.json.gz.enc`. A manager whose data is too large or not JSON writes its own files into `directory`, named `<stem>.<name>.db` (a database, `DatabaseManager`, #1723) or `<stem>.<part>.tar` / `.tar.enc` (a folder of files, #1876, encrypted under the backup key when it is set), and names them in its entry. They are listed, downloaded and pruned with the document (`isCompanionOf`); a backup whose document is never written removes the files it made.
- A manager that throws gets `{ error, timestamp }` in its slot; one that missed a part lists it in `warnings`. The backup is still written, and admins get "A backup is incomplete" naming each part. A part left out only because there is no backup key (its message starts `LEFT_OUT_FOR_NO_KEY`, `src/utils/backupKey.ts`: the credentials store, the databases) is not named there and alone sends no notice: the banner and the one-time notification, which names what is left out, cover it (operator, #1912). Any other failure still notifies at every backup. A restore's safety backup (`requireComplete`) still refuses either kind.
- BackupManager's own part: the instance `.env` without the `NGDPBASE_BACKUP_KEY` line, `<stem>.env.tar.enc`, only ever encrypted (`backupInstanceEnv`, `src/utils/instanceEnvBackup.ts`). A site restore stages it as `.env.staged`; `bootstrap-env.ts` applies it before the file is loaded, keeping the live backup and database key lines.
- The backup key (#1876, "one thing to save"): `backupKeyInfo()` (set, fingerprint, saved — never the key), `revealBackupKey()` (only for `GET /admin/backup/key`, behind `config-manage` and its fresh sign-in), `confirmBackupKeySaved(ctx, fingerprint)` (records `ngdpbase.backup.key-saved-fingerprint`). Until an admin confirms, BackupManager is degraded with "Save the backup key off this server …" and the fingerprint: the dashboard banner. A different key asks again.
- Options: `filename`, `compress` (default true), `skipCleanup`, `requireComplete` (throw after notifying when any part failed), `safetyBackup` (this is a restore's backup of the live data, #1892).
- Retention: after each backup the oldest beyond `ngdpbase.backup.max-backups` are removed with their files (`cleanupOldBackups`).
- Automatic backups are the scheduled job `backup.auto` (#1720): `ngdpbase.backup.auto-backup`, `-time` (`HH:MM`, server time zone) and `-days`.
- __Space first, read back after__ (#1563). Before anything is written, free space at the destination (`BaseBackupProvider.freeSpace()`; `FileBackupProvider` uses `statfs`) is compared with the last backup's `totalSize` times `ngdpbase.backup.space-margin`; too little refuses the backup ("not enough free space …, Nothing was written"). No earlier backup, or a provider that can't tell, skips the check. A write that fails part-way removes the half-written document. After writing, the document is read back on a worker thread (`verifyBackupOffThread`, `src/utils/backupDocument.ts`): decrypted under the key (every record's GCM tag), decompressed, parsed and checked for its shape — the same `readBackupDocument` a restore uses. One that does not read back is removed, with the files beside it, and the backup fails. `backup-create` is recorded only for a backup that read back.

## Backups never fail silently

(#1563, operator: "We need a persistent 'backups not working'".) BackupManager decides; Admin → Backup and the `/admin` dashboard show what it says.

- __A failed backup is an outage__ (`markDegraded`, the dashboard's "not working" section): out of space, a write or permission error, a failed encryption, the space check, a failed read-back, or a part missing ("A backup is incomplete", whose own notification is kept). The reason (system error codes named, `describeBackupError`) and the last good backup's date are in the banner. It is kept in the health record, `ngdpbase.backup.health-file` (default `${FAST_STORAGE}/backup-health.json`), so a restart does not clear it; only a backup that succeeds does. Admins get one error notification, "Backups are not working", per reason — not one per failed attempt — through `NotificationManager`, so its email escalation applies.
- __No good backup recently enough is an outage__: "No good backup since" and the date (server local time), or "No good backup since: never" on a site that has none (a new site shows it until its first backup). The window is `ngdpbase.backup.stale-interval-multiplier` (default 2) times the longest gap between `backup.auto` runs while automatic backups are on and scheduled (`longestGapMs`: daily is 1 day, Mon/Wed/Fri 3, monthly 31), and `ngdpbase.backup.stale-fallback-days` (default 7) while they are off, paused in Admin → Scheduled Jobs, or not scheduled. One notification per stretch, kept across restarts in the same record.
- __The last good backup is never remembered__: it is the newest document in the backup directory (`listStoredBackups`) other than the one a kept failure names (an incomplete backup), so it survives restarts and follows what is really on disk.
- __Checked__ at start, after every backup, and by the routine job `backup.health` every `ngdpbase.backup.health-check-interval` ms (default one hour; `BackgroundJobManager.registerMaintenance`, so it runs as the system principal and is listed on Admin → Scheduled Jobs).
- __One status slot, outage first__: the outage replaces the backup key's reminders (`BACKUP_KEY_MISSING`, "Save the backup key …"), which come back once backups work (`checkBackupKey` never hides an outage). A backup directory that could not be used at start keeps its own outage.
- `getBackupHealth()` — `{ lastGood: { filename, at, size, location } | null, autoBackup, nextRun, freeBytes, failure, staleAfterMs, stale, fault }`, read from disk each time; `nextRun` from `BackgroundJobManager.scheduledJobView('backup.auto')`. `refreshBackupHealth()` applies it to the status. Rendered by `views/_backup-health.ejs` on both pages, times as `<time data-local-time>`.

## Stored backups

- `listBackups()` — the documents, newest first.
- `listStoredBackups()` / `findStoredBackup(filename)` — each with `databases` (its `.db` files by name), `parts` (its `.tar` / `.tar.enc` files by part), `files` (every file beside it), `encrypted` (the document is) and `totalSize`. A filename is only ever matched against this list, never used as a path.
- `backupArchive(filename)` — one backup as a streamed `.tar` of the document and every file beside it, read as the stream is consumed.

## Restore

`restoreFromFile(ctx, backupPath, options)` reads the document — an encrypted one only under the backup key it was made with, refused by its fingerprint otherwise — validates it, then:

- __Databases only__ (`managerFilter: ['DatabaseManager']`, what Admin → Backup's databases-only restore does through `startRestore`): a complete backup of the live data, then `DatabaseManager` stages the databases for the next start ([DatabaseManager.md](DatabaseManager.md#backup-and-restore)).
- __A site restore__ (no filter, or a filter naming any other manager whose `restoreIsStaged()` is true; Admin → Backup's whole-site restore passes exactly those managers, #1945): every such manager in the backup stages its part under one site restore manifest, `ngdpbase.backup.restore-manifest`, all or nothing, after a complete backup of the live data, and the next start applies every part or none. Refused when a site or database restore is already staged (unless `replaceStaged`), or when a staged part's backup slot is an error. Details in the [guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876).
- In a site restore the managers without a staged restore are __not__ restored: they are listed in `skipped` and named in the notification below. While a site restore is staged, a call that would restore any manager live is refused.
- Otherwise (a `managerFilter` naming managers without a staged restore, and no site restore staged) each is restored __live__ by its own `restore()`, a failure listed in `failed`, not rolled back. Nothing calls `restoreFromFile` that way today.
- Either restore writes BackupManager's report beside the manifest (`<manifest>.report.json`): the backup's parts that were not staged, and the job runs since the backup from `BackgroundJobManager.runsSince`, read now, before the restore replaces the job state.

Each manager's `restore(data, options)` gets `{ ctx, directory, source, replaceStaged, safetyBackup, siteRestore }` (`ManagerRestoreOptions`).

Also:

- `startRestore(ctx, filename, { replace, scope })` — Admin → Backup's restores. `scope: 'databases'` (the default, #1723): the databases only, refused while a site restore is staged. `scope: 'site'` (#1945): a whole-site restore of any stored backup, `restoreFromFile` with a `managerFilter` of every manager on this site whose restore is staged, so nothing is restored live. Either records `backup-restore` / `backup-restore-replace` first (refuse), with `metadata.scope`, then runs in the background and notifies admins; a failure notifies "Restore of … was not staged". A staged restore of either kind is replaced only with `replace`.
- `siteRestoreScope()` — what a whole-site restore on this site puts back and what it does not, as the "not restored" notification names them (`restoreLabel`, `NEVER_IN_A_BACKUP`), for the card on Admin → Backup (#1945).
- `getStagedRestore()` — the restore waiting for the next start, `{ scope, source, stagedBy }`: the site restore when one is staged (it holds the databases' own record too), else a databases-only one, else null.
- `cancelStagedRestore(ctx)` — cancels whichever is staged, through `cancelStagedSiteRestore` or `DatabaseManager.cancelStagedRestore` (#1945).
- `getStagedSiteRestore()` — the staged site restore manifest, or null.
- `cancelStagedSiteRestore(ctx)` — records `backup-restore-cancel` (refuse), then removes every staged file and the manifest.
- `reportRestoreAtBoot()` — called once every manager and add-on has started (end of `WikiEngine.initializeAddons`): tells admins what the start did with a staged site restore (applied, not applied, or applied only in part), records `backup-restore-applied` into the restored audit log (the backup, who started it, the parts), and after any restore that was applied, site or databases-only, sends the critical "Critical: a restore did not bring everything back" (error level): what was put back, what was not (`NEVER_IN_A_BACKUP` plus the report's parts), and per job the runs between the backup and the restore — name, last run, result (`describeNotRestored`). Jobs are never re-run.

## Configuration

| Key | Default | |
| --- | --- | --- |
| `ngdpbase.backup.directory` | `${SLOW_STORAGE}/backups` | where backups are written |
| `ngdpbase.backup.provider` | `filebackupprovider` | the storage provider (the only one) |
| `ngdpbase.backup.max-backups` | `10` | retention |
| `ngdpbase.backup.auto-backup`, `-time`, `-days` | `false`, `02:00`, `daily` | automatic backups |
| `ngdpbase.backup.restore-manifest` | `${FAST_STORAGE}/site-restore.json` | the staged site restore's record (#1876); also found at boot, before the configuration loads (`siteRestoreFileAtBoot`) |
| `ngdpbase.backup.key-saved-fingerprint` | `""` | the fingerprint of the backup key an admin confirmed is saved off the server (#1876) |
| `ngdpbase.backup.stale-interval-multiplier` | `2` | with automatic backups on: no good backup within this many times the longest gap between runs is an outage (#1563) |
| `ngdpbase.backup.stale-fallback-days` | `7` | the same window, in days, with automatic backups off (#1563) |
| `ngdpbase.backup.health-check-interval` | `3600000` | ms between `backup.health` checks (#1563) |
| `ngdpbase.backup.space-margin` | `1.5` | free space needed before writing, as a multiple of the last backup's size (#1563) |
| `ngdpbase.backup.verify-timeout-ms` | `600000` | limit on reading a new backup back (#1563) |
| `ngdpbase.backup.health-file` | `${FAST_STORAGE}/backup-health.json` | the failure (and the last "no recent backup" notice) kept across restarts (#1563) |

`ngdpbase.backup.compress` and `ngdpbase.backup.auto-backup-interval` are in the default config, but nothing reads them.

## Related

- [Backup and restore guide](../guides/backup-restore-guide.md)
- [DatabaseManager](DatabaseManager.md#backup-and-restore), [AttachmentManager](AttachmentManager.md#backup-and-restore), [RoleManager](RoleManager.md#backup-and-restore), [AuthManager](AuthManager.md#backup-and-restore), [AuditManager](AuditManager.md#backup-and-restore), [BackgroundJobManager](BackgroundJobManager.md#backup-and-restore)
- [BackupManager-Complete-Guide.md](BackupManager-Complete-Guide.md) (older; the guide above wins where they differ)
