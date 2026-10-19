---
name: DatabaseManager
description: "The one door to the application database: an optional SQLite file, encrypted with SQLCipher when a key is set, with a dated migration ledger"
dateModified: '2026-10-18'
category: managers
code: src/managers/DatabaseManager.ts
---

# DatabaseManager

__Module:__ `src/managers/DatabaseManager.ts`
__Extends:__ [BaseManager](BaseManager.md)

The one door to the application database ([#1536](https://github.com/jwilleke/ngdpbase/issues/1536)). A manager that stores rows is handed the connection through `getHandle()`; nothing opens a database handle of its own. Ported from yourPHR, where it is in production.

## Configuration

- `ngdpbase.database.provider` — `none` (default) or `sqlite`. Nothing in core stores rows yet, so no database is opened by default; the first user will be the database audit provider ([#1537](https://github.com/jwilleke/ngdpbase/issues/1537)). Any other value refuses to start.
- `ngdpbase.database.file` — the SQLite file, default `${FAST_STORAGE}/ngdpbase.db`.
- `ngdpbase.database.busy-timeout-ms` — how long a statement waits, in milliseconds, for a lock another connection holds (a second pod during a rolling update, a long read) before failing with `SQLITE_BUSY`. Default `5000`, the driver's own default, stated ([#1710](https://github.com/jwilleke/ngdpbase/issues/1710)). Applies to the application database and every add-on database. A value that is not a whole number, 0 or more, refuses to start.
- `NGDPBASE_DATABASE_KEY` — the SQLCipher key, from the environment or the instance `.env`, never from config. Without it the file is plain SQLite and boot logs a warning.
- `NGDPBASE_BACKUP_KEY` — the key every database backup is encrypted under ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)), from the environment or the instance `.env`, never from config. Its own secret: the same value as `NGDPBASE_DATABASE_KEY` still backs up, but degrades the manager and notifies admins exactly as a missing key does. Without it no database is backed up: see [Backup and restore](#backup-and-restore).
- `ngdpbase.database.backup.worker-timeout-ms` — how long a backup's database copy, or a restore's staging, may run on its worker thread before it is stopped and reported as failed. Default `3600000` (an hour). Read at each backup; a value that is not a whole number above 0 fails that backup, naming the key.

## What boot refuses

- A database file on a network filesystem (NFS, SMB, CIFS on Linux): WAL mode needs shared memory those do not provide. Unknown filesystem types and non-Linux hosts are allowed. Backups may still go to a NAS.
- A database whose schema records a migration this build does not know — it belongs to a newer build.
- A migration that fails; it is rolled back and named.
- A database that fails SQLite's `quick_check`, or a wrong key, or no key on an encrypted file (SQLite says "file is not a database"). An existing file is first read through a read-only connection (`SqliteDatabaseProvider`), so a damaged or unreadable file and its WAL are never written: a read-write connection that fails to read still checkpoints the WAL into the file when it closes, or deletes a WAL it can't parse. Only the `-shm` index, which SQLite rebuilds from the WAL, may be rewritten.
- A staged restore ([below](#restore-staged)) whose files can't be put in place.

### When the application database can't be opened: maintenance mode

The process does not stop ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892), operator, 2026-10-18). For any of the refusals above, on the application database:

- `initialize()` resolves. Nothing is opened unencrypted, and nothing further is migrated or written. `isEnabled()` is false, `getUnavailableReason()` returns the reason, and the manager's status is `failed`.
- The site is put in maintenance mode through `engine.blockConfiguration` (#1152) with the public message `ngdpbase.managers.addons-manager.site-critical.public-message` (#1883). Visitors, and `/health/readiness`, get only that message (503); `/admin`, `/login` and `/logout` stay reachable.
- `reportAtBoot()` sends administrators an `error` notification, "Critical: the application database is not available", with the reason and the fix: set (no key) or correct (a key that doesn't open it) `NGDPBASE_DATABASE_KEY` in `<FAST_STORAGE>/.env` and restart; for a damaged file or a failed migration, restore the databases from a backup on Admin → Backup (applied at the next restart, the current file kept as `*.pre-restore`), or put a good copy of the file back with the server stopped and restart.
- What needs it is held, not run on a substitute: `addonRefusal()` refuses every enabled add-on that declares a database (before it is imported, so the #1883 notification and site-critical rule apply), `openAddonDatabase()` throws, `backup()` throws (the backup is reported incomplete, never silently without the databases), and `BackgroundJobManager` runs no job, scheduled or by hand ([BackgroundJobManager](BackgroundJobManager.md#when-the-application-database-is-unavailable-1892)).
- __A restore still works__ (operator D2, 2026-10-19), with `NGDPBASE_DATABASE_KEY` set: without it what it staged would be unencrypted, so it is refused, saying to set the key first. Its safety backup leaves the databases out, since they can't be read, and records that in DatabaseManager's entry: `leftOut: { databases, reason }` and a `note`, not a failure, so the safety backup still counts as complete. At the restart each live file, with its `-wal` and `-shm`, is kept as `*.pre-restore`, which covers what the safety backup could not. The restore card on Admin → Backup says so, and so does the "staged" notification.
- What still works: sign-in, sessions, users, notifications and `/admin`. None of them use the application database. Admin → Backup and Admin → Jobs open; an ordinary backup taken there is reported incomplete, and jobs show as held.
- `ngdpbase.database.provider` `none` is unaffected: no file is opened and nothing is held.

Configuration errors in the keys themselves (an unknown provider, a malformed `busy-timeout-ms`) still stop the boot. A failure on an add-on's own database is the add-on's load failure (#1883), not this.

## Migrations

`src/providers/databaseMigrations.ts` is the ledger: entries with a `YYYYMMDDHHMMSS` id, strictly ascending, each a frozen snapshot of what it did on its date. Each runs once, in its own transaction, and is recorded in `schema_migrations`. There is no `down()`; the rollback is a backup taken before migrating. Use `addColumnWithDefault()` for any counter-like column, so existing rows are backfilled rather than left `NULL`.

## Add-on databases

An add-on that keeps rows gets its own database through the same door ([ngdp-accounting-addons#13](https://github.com/jwilleke/ngdp-accounting-addons/issues/13)). It first declares the database in its own `config/default-config.json` ([#1860](https://github.com/jwilleke/ngdpbase/issues/1860)):

```json
{
  "ngdpbase.addons.accounting.database": { "owner": "accounting", "ledgerTable": "accounting_schema_migrations", "encrypt": "optional" }
}
```

Then it opens it from `register()`:

```ts
const databaseManager = engine.getManager<DatabaseManager>('DatabaseManager');
const db = databaseManager.openAddonDatabase<SqliteHandle>('accounting', {
  migrations: ACCOUNTING_MIGRATIONS,
  ledgerTable: 'accounting_schema_migrations'
});
```

- Only a declared database opens. `openAddonDatabase(owner, { ledgerTable })` throws unless an enabled add-on declares that `owner` with that `ledgerTable`. The key is always `ngdpbase.addons.<the declaring add-on's slug>.database`; the three fields are required and nothing else is allowed.
- `encrypt` is `"required"` or `"optional"`. A `"required"` database is never opened without `NGDPBASE_DATABASE_KEY`: the add-on is not loaded at all (checked before it is imported), `/admin/addons` shows why, and the reason names the fix (set the key in the instance `.env` and restart). `"optional"` opens unencrypted without a key, with the warning. When the add-on is site-critical, that or any other failure to load, a failed migration or integrity check in `register()` included, puts the whole site in maintenance mode ([#1883](https://github.com/jwilleke/ngdpbase/issues/1883), [the addons developer guide](../guides/addons-developer-guide.md#when-an-addon-does-not-load-site-critical)).
- An invalid declaration (a missing or mistyped field, a ledger outside the owner's prefix, a key under another add-on's slug, a ledger another add-on already declares) stops that add-on loading, as a refused system-category does ([#1559](https://github.com/jwilleke/ngdpbase/issues/1559)). It is logged at startup and posted to admins.
- The declaration is read from every installed add-on, on or off, and is never part of the merged configuration, so the site's `app-custom-config.json` cannot change it (a value there is ignored, with a warning). `getDeclaredDatabases()` lists every declaration with its file and whether it is open; Admin → Add-ons shows the list. A turned-off add-on's database stays listed, so the backup ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)) can include it.
- Call it from `register()`. It needs the application database: when `ngdpbase.database.provider` is `none` it throws, naming the key, and the add-on should mount nothing and say why in `status()`.
- The file is `<owner>.db` beside `ngdpbase.database.file`, opened by `SqliteDatabaseProvider` under `NGDPBASE_DATABASE_KEY`, so everything in [What boot refuses](#what-boot-refuses) applies to it too.
- Its migrations follow the rules in [Migrations](#migrations), recorded in the add-on's own ledger table. The table name must start with the owner's slug, dashes as underscores, then `_`. Prefix the add-on's tables the same way, so several databases can later be told apart by table name in one backup.
- An add-on that depends on the owner declares the owner's slug and its own ledger table (`"owner": "accounting", "ledgerTable": "accounting_dues_schema_migrations"`, under `ngdpbase.addons.accounting-dues.database`), and calls `openAddonDatabase` with them. Its migrations run on the owner's file and it gets the same connection. Registering one ledger table twice throws.
- `integrityOk()` covers every open database (and is false while the application database is unavailable), and `shutdown()` closes the add-on databases, then the application database. Managers shut down in reverse registration order, so `AddonsManager`, and the add-ons with it, stop before `DatabaseManager` closes their connections.

## Backup and restore

`DatabaseManager` overrides `backup()` and `restore()`, the methods `BackupManager` calls on every manager ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). Add-ons write no backup code: their databases are in every backup because they are declared.

### Backup

- __What:__ the application database and every declared add-on database (`getDeclaredDatabases()`), whether or not its add-on is on. A turned-off add-on's file is read without being opened for use: no migrations, no `openAddonDatabase`. A declared database whose file was never created is listed in the backup as `absent`.
- __One point in time:__ each database gets its own connection; a read transaction is opened on every one, back to back, before any copying starts. The live files are in WAL mode, so the copy never blocks the site's writes, and a write committed after the snapshot is in none of the copies.
- __Off the request thread:__ the copy runs on a worker thread (`src/providers/sqliteBackup.ts`, `sqliteBackupWorker.ts`), so a large database stalls neither requests nor the liveness probe. Keys travel to the worker in memory, never in argv or the environment.
- __Always encrypted__ under `NGDPBASE_BACKUP_KEY`, from the first byte: the copy is SQLite writing into a file attached under that key, with no plaintext intermediate. A database stored unencrypted is still backed up encrypted. Each copy is reopened under the backup key and integrity-checked before it counts.
- __Beside the document, not inside it:__ each database is its own file, `<stem>.<name>.db`, in the backup directory next to `<stem>.json.gz`; `name` is `application` or `addon-<owner>`. The document's `DatabaseManager` entry lists each file with its size and table count. Retention removes the files with their document.
- __Key fingerprint:__ the entry records `keyFingerprint`, the first 16 hex digits of an HMAC-SHA256 of a fixed label under the backup key. It never reveals the key; a restore under another key is refused with "This backup was made with a different backup key", naming both fingerprints.
- __Loud failures:__ with no backup key, `backup()` throws and writes nothing, the manager is degraded (the dashboard's banner) from the start, and the backup's admins get a "backup is incomplete" notification. A database that cannot be copied is named in the entry's `failed` list and in `warnings`; the others are still written, and admins are told.
- Copied with each database: every table and its rows, indexes, triggers, views, FTS5 tables (with their rowids), `sqlite_sequence` (AUTOINCREMENT counters) and `user_version`.

### Restore (staged)

- __From Admin → Backup__ (D1): the restore form lists the backups in the backup directory that hold databases (date, databases) and asks for the site name (`ngdpbase.application-name`) to be typed. It needs `config-manage`, the permission the other backup actions need, and the fresh sign-in that permission's step-up asks for. `BackupManager.startRestore(ctx, filename, { replace })` records `backup-restore` (or `backup-restore-replace`) first, on-failure refuse, then runs the restore in the background, the databases only (`managerFilter: ['DatabaseManager']`): nothing else in the backup is restored. Admins are notified when it is staged or why it was not. The site is never restarted by it.
- `BackupManager.restoreFromFile(ctx, path)` restores the databases __first__: it takes a fresh backup of the live data, which must be complete, then calls `restore()`. If either fails, no manager is restored at all.
- Staging opens each database's file under the backup key, runs `integrity_check`, and copies it into `<live>.staged` beside the live file, under `NGDPBASE_DATABASE_KEY`. Each staged copy is reopened and checked. __All or nothing:__ if any database fails, every staged file is removed. Only then is the manifest written, `<application file>.restore.json`.
- A database the backup does not contain is never touched. An add-on database that no add-on on this site declares is not staged, and admins are told. One declared `encrypt: "required"` is never staged without `NGDPBASE_DATABASE_KEY`. A file name in the document that is not a bare name in the backup directory is refused.
- __A staged restore is never replaced silently__ (D5). A second restore before the restart is refused unless it says `replaceStaged` (`replace` from the page, "Replace it", with the same typed confirmation), and the replacement is recorded as `backup-restore-replace`. The manifest records the backup's filename (`source`), when it was taken, when it was staged, who staged it, and the safety backup of the live data taken just before (`safetyBackup`, D6), and Admin → Backup shows them; the "staged" notification names the safety backup too. The card says, before the confirmation, "Restores the databases only. Pages, users and settings are not changed." (full restore is [#1876](https://github.com/jwilleke/ngdpbase/issues/1876)). `cancelStagedRestore(ctx)` ("Cancel staged restore") records `backup-restore-cancel` first (refuse) and removes the staged files and the manifest; the live databases are untouched.
- __At the next start__, before any database opens, each live file and its `-wal` and `-shm` step aside as `*.pre-restore` (`*.pre-restore-wal`, `*.pre-restore-shm`, so the kept copy still opens as it was), and the staged file takes its name. Migrations then run on the restored file as on any other. If any database the manifest names is not staged, nothing is applied: the staged files are renamed `*.incomplete`, the manager is degraded and admins are told. A staged file with no manifest (staging interrupted) is set aside the same way. A manifest naming a file other than the application database or an `<owner>.db` beside it is refused.
- `getStagedRestore()` returns the manifest of a restore waiting for the restart. `reportAtBoot()`, called by the engine once notifications exist, tells admins what the start did with a staged restore, and about a backup key that is missing or equal to the database key.

### Known gaps

- __A restore while the application database is unavailable has no copy in its safety backup__ (#1892 D2). Undoing it means putting the `*.pre-restore` files back by hand, with the server stopped; restoring the safety backup brings back no database.
- __Restore needs a site that starts.__ The restore is on Admin → Backup; there is no command line for a site that will not start (deferred until needed).
- __Only the databases are restored from the page.__ The rest of a backup document (settings, users) is not restored by the button; `restoreFromFile` without a filter still restores every manager, and nothing calls it that way.
- __Key rotation:__ an old backup needs the key it was made with; nothing re-encrypts old backups under a new key.
- __Download:__ Admin → Backup downloads each backup as one streamed `.tar` (the document and its database files, `BackupManager.backupArchive`). The backup key is not in it.
- __Only a file backup provider.__ The database files are written straight into the backup directory, which `FileBackupProvider` (the only provider) uses. A provider storing elsewhere would need them uploaded.
- __A crash in the middle of applying__ (between the renames) leaves the databases already moved restored and the rest staged; the next start finds staged files missing, sets the rest aside as `*.incomplete` and says so. A rename that fails while applying (#1892) opens no database and puts the site in maintenance mode; the files are left as they were at the failure, for the administrator to put back.
- __A second process__ (a pod in a rolling update) that has a database open while the next start applies a restore is not detected.
- __Changing the database key__ through a backup and a restore under a new key works by the same path, but has not been made a documented procedure.

## Providers

- [BaseDatabaseProvider](../../src/providers/BaseDatabaseProvider.ts) — `handle`, `integrityOk()`, `storage()`, `close()`.
- [SqliteDatabaseProvider](../../src/providers/SqliteDatabaseProvider.ts) — `better-sqlite3-multiple-ciphers`, WAL mode, `synchronous = FULL`; durability: unbuffered and fsynced. Its constructor takes the ledger table name (default `schema_migrations`), and `migrate(ledger, ledgerTable)` runs a further ledger on the same connection.
