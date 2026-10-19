---
name: Backup and restore guide
description: How a site is backed up and restored today — triggers, files, retention, the staged databases restore and the staged site restore, what a backup holds and what it doesn't, what an operator must do to have a restorable site, the rules for developers and add-on authors, and every known gap
dateModified: 2026-10-19
category: guides
relatedModules: [BackupManager, BaseManager, BackgroundJobManager, DatabaseManager, PageManager, AttachmentManager, UserManager, ConfigurationManager, RoleManager, PersonManager, OrganizationManager, FootnoteManager, CommentManager]
---

# Backup and restore guide

The one place that says how a site is backed up and restored, for operators and for developers, add-on authors included. Every statement here was checked against the code on master (v5.18.0 plus the database backup and restore of #1723, merged as 26a11b58) and against a backup taken on a throwaway instance on 2026-10-18, not against older documents; the parts added by [#1876](https://github.com/jwilleke/ngdpbase/issues/1876) slice 1 (attachment files, role membership, persons, organizations, public footnotes and comments, and the staged site restore) were checked against their tests and a throwaway instance on 2026-10-19. Where something could not be checked it says "not verified".

In short: __a site can be backed up, and Admin → Backup can restore only its databases.__ The backup now also holds the attachment files, role membership, persons, organizations, and the footnotes and comments of public pages, and those restore staged with the databases, all or nothing, at the next start ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876) slice 1) — but nothing on Admin → Backup starts that restore yet, and pages, users and settings still have no staged restore. The backup still leaves out several kinds of data. Until the whole-site restore is finished, a restorable site means a copy of the data folders, taken while the server is stopped, plus the keys kept somewhere else.

## Where a site's data lives

- __`FAST_STORAGE`__ is the instance data folder (falling back to the legacy `INSTANCE_DATA_FOLDER`, then `./data`; `src/utils/configFiles.ts` `instanceDataFolder`). It holds `config/app-custom-config.json`, `users/` (users and the credentials store), `roles/`, `persons/`, `organizations/`, `sessions/`, `logs/` (including `audit.log`), `search-index/`, `page-index.json`, `media-index.json`, `oidc/`, `shares/`, `notifications/`, `jobs/`, the database file `ngdpbase.db`, and the generated `.env`.
- __`SLOW_STORAGE`__ holds `pages/` (with `pages/vaults/`, the private stores), `attachments/`, `footnotes/`, `comments/` and, by default, `backups/`.
- __`<FAST_STORAGE>/.env`__ holds the keys the site generates for itself: `NGDPBASE_SESSION_SECRET`, `NGDPBASE_CREDENTIALS_KEY`, and the OpenID Connect provider's `OIDC_AUTH_SERVER_JWKS` and `OIDC_AUTH_SERVER_COOKIE_KEYS` when that provider is on. `NGDPBASE_DATABASE_KEY` and `NGDPBASE_BACKUP_KEY` are set there or in the environment by the operator; the site never generates them.
- Each path is a config key; the defaults are in `config/app-default-config.json`, and a site can move any of them.

## How a backup is made

- __By hand:__ Admin → Backup (`/admin/backup`) → __Create & Download Backup__ (`POST /admin/backup/create`, `WikiRoutes.adminBackup`). It needs `config-manage` and a fresh sign-in when that permission is listed in `ngdpbase.auth.step-up`. The backup is written to the backup folder and then downloaded as one streamed `.tar` holding the document and its database files (`BackupManager.backupArchive`); the server keeps its copy. Any stored backup can be downloaded the same way from the list (`GET /admin/backup/download/:filename`). The backup key is never in the `.tar`.
- __On a schedule:__ automatic backups are the scheduled job `backup.auto` (`BackupManager.scheduleAutoBackup`, #1720). They are off by default (`ngdpbase.backup.auto-backup: false`). `ngdpbase.backup.auto-backup-time` is `HH:MM` in the server's time zone; `ngdpbase.backup.auto-backup-days` is `daily`, `monthly` (the 1st), `weekdays` or day names such as `Mon,Wed,Fri` (`autoBackupSchedule`). A backup missed while the server was down runs once when it is back, one still running is not doubled, and a failed run is tried up to three times (again after 1 and 5 minutes). The settings are saved from Admin → Backup (`POST /admin/backup/config`, `config-manage`) into `app-custom-config.json`.
- __Where:__ `ngdpbase.backup.directory`, default `${SLOW_STORAGE}/backups`, through the storage provider `ngdpbase.backup.provider` (`filebackupprovider`, the only one). The folder is made owner-only and each file `0600` where the filesystem allows (`FileBackupProvider.writeBackup`, #1560).
- __The files:__ a backup is one gzipped JSON document, `{timestamp}-ngdpbase-backup.json.gz`, shaped `{ version: "1.0.0", timestamp, application: "ngdpbase", managers: { <ManagerName>: <that manager's backup()> } }` (`BackupManager.createBackup`), plus the files the managers write beside it, which the document references and which are pruned and downloaded with it (`isCompanionOf`):
  - one encrypted file per database, `<stem>.<name>.db` (below);
  - one `.tar` per folder of files ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): `<stem>.attachments.tar` (the shared attachment pool, without its `.thumbs` thumbnails, which are made again on demand, and without the metadata file the document already holds), `<stem>.vault-attachments.tar` (every vault's `attachments/` folder and `files-index.json`, as stored: a sealed vault's files stay sealed bytes), `<stem>.roles.tar`, `<stem>.persons.tar`, `<stem>.organizations.tar`, `<stem>.footnotes.tar` and `<stem>.comments.tar`. Each is written and read as a stream, file by file, so no file is ever whole in memory, and no file's bytes are in the JSON (`src/utils/treeArchive.ts`). A symbolic link or other non-file in one of these folders is left out and named in the backup's warnings.
- The document is built whole in memory and __it is not encrypted__: it holds password hashes, every user record and the custom configuration as written, secrets included. __The `.tar` files are not encrypted either__ ([#1561](https://github.com/jwilleke/ngdpbase/issues/1561)): they hold the shared attachments, the files of unsealed vaults, role membership, persons and organizations as they are on disk. The database files are encrypted (below).
- __Databases:__ `DatabaseManager.backup` copies the application database and every declared add-on database ([#1860](https://github.com/jwilleke/ngdpbase/issues/1860)), on or off, at one point in time, on a worker thread (`src/providers/sqliteBackupWorker.ts`), each encrypted under `NGDPBASE_BACKUP_KEY` (environment or instance `.env` only, never config). Each backup records a `keyFingerprint` of that key, never the key. Without the key no database is written: `DatabaseManager` is degraded and the backup is reported incomplete. A backup key equal to `NGDPBASE_DATABASE_KEY` still backs up, but degrades `DatabaseManager` and notifies admins the same way. `ngdpbase.database.backup.worker-timeout-ms` (default `3600000`) limits the worker's copy, and a restore's staging. With `ngdpbase.database.provider` `none` (the default) there is no database and nothing to copy.
- __How it is filled:__ `createBackup` calls `backup()` on every registered manager, core and add-on, in registration order. A manager that throws gets `{ error, timestamp }` in its slot, and a manager can report a part it missed in `warnings`. The backup carries on and is written, and then admins get an error notification "A backup is incomplete" naming each missing part. It is still not a snapshot (#1213).
- __Retention:__ after each backup the oldest backups beyond `ngdpbase.backup.max-backups` (default 10) are deleted with their database files, by-hand and automatic alike (`BackupManager.cleanupOldBackups`). A failed cleanup is only a log warning.
- __Record:__ a successful backup writes the `backup-create` audit event, naming who asked and where the file went.
- __Failure:__
  - A scheduled backup that fails posts an admin error notification ("Automatic backup failed") on each failed attempt, and the job records `job-failed` after the last (`BackgroundJobManager`). A success posts an "Automatic backup complete" notification.
  - Automatic backups switched on with a time or days setting that can't be read: an admin error notification ("Automatic backups are not running") and an error log line; nothing runs until it is fixed.
  - A backup folder that can't be used at start (for example an unmounted volume): `BackupManager` is marked degraded, which the `/admin` dashboard shows, and backups are off until restart (`BaseManager.preflightConfiguredPath`).
  - A backup by hand that fails outright returns an error page. No notification is sent. One that is written with a part missing notifies admins, as above.
  - Not yet: no warning when backups stop happening, no free-space check before writing, no read-back check after writing ([#1563](https://github.com/jwilleke/ngdpbase/issues/1563)).
- `ngdpbase.backup.compress` and `ngdpbase.backup.auto-backup-interval` are in the default config but nothing reads them. Compression is always on and the schedule is the time and days settings.

## What a backup holds

"Yes" means the data is in the backup: the `.json.gz`, or for databases the encrypted files beside it. "No" means the backup has nothing of it, so a copy of the folder is the only backup there is. Rows marked "probe" were confirmed in a backup taken on a throwaway instance.

| Data | In the backup | Manager | Evidence |
| --- | --- | --- | --- |
| Pages, current text (public and required pages) | Yes (probe) | PageManager | `FileSystemProvider.backup`: every `.md` under the pages and required-pages folders |
| Page version history | Yes, with `versioningfileprovider` (probe). The shipped default `filesystemprovider` keeps no history | PageManager | `VersioningFileProvider.backup` → `readVersionFiles` (read and written as UTF-8 text) |
| Public trash (deleted pages) | Yes, with `versioningfileprovider` (probe) | PageManager | `VersioningFileProvider.readTrash` |
| Page index (`page-index.json`) | No; rebuilt from the version manifests when it is empty at start | PageManager | `VersioningFileProvider.rebuildPageIndexFromManifests` |
| Private stores / vaults | Yes, every file of every vault as stored, sealed files still sealed: pages, history, trash, footnotes and comments, `store.json`, and each user's `user-keys.json` (probe: a vault page, its history and its indexes). Not the vault's files and their `files-index.json`, which are AttachmentManager's (next rows). __None of it__ when the whole private tree is over 256 MB; the backup then carries `privateOmitted` and the server logs an error | PageManager | `FileSystemProvider.backupPrivateStores`, `privateStoreTakeout.collectUser` (`skip`) |
| A leftover legacy `pages/private/` folder | No | PageManager | `walkDir` skips it and `listPrivateOwners` reads only the current private root |
| Attachment metadata (shared pool) | Yes (probe) | AttachmentManager | `BasicAttachmentProvider.backup`: the metadata map |
| Attachment files (shared pool) | Yes, as `<stem>.attachments.tar` beside the document, streamed, without `.thumbs` ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876); tests and throwaway instance) | AttachmentManager | `BasicAttachmentProvider.backupFiles`, `src/providers/attachmentFilesBackup.ts` |
| Vault files (attachments of vault pages) and each vault's `files-index.json` | Yes, as `<stem>.vault-attachments.tar`, the bytes as stored: never decrypted, never base64 in the JSON (#1876; tests) | AttachmentManager | `backupAttachmentFiles` |
| Footnotes and comments on public pages | Yes, as `<stem>.footnotes.tar` and `<stem>.comments.tar`: the public folders as they are, including any vault page's notes left there in the clear from before #1839 (#1876; tests) | FootnoteManager, CommentManager | `backupDirectoryPart` (`src/utils/directoryBackup.ts`) |
| Users (records, password hashes, preferences) | Yes (probe) | UserManager | `FileUserProvider.backup`: users and the provider's sessions map |
| Role membership, persons, organizations | Yes, as `<stem>.roles.tar`, `<stem>.persons.tar`, `<stem>.organizations.tar`: the record folders as they are (#1876; tests and throwaway instance) | RoleManager, PersonManager, OrganizationManager | `backupDirectoryPart` |
| Credentials store: passkeys, TOTP, verified email and phone, known devices, linked identities, proxy grants | No | AuthManager | `AuthManager.backup` lists provider ids only; the store is `ngdpbase.auth.credentials.file` |
| Sign-in sessions (`sessions/`) | No; people sign in again | none | |
| Configuration: `app-custom-config.json` | Yes, as written, secrets included (probe). Copies of the default and merged configuration are carried for reference; only the custom file would be restored | ConfigurationManager | `ConfigurationManager.backup` |
| `.env` and the keys in it | No | none | `ConfigurationManager.backup` reads the config files only |
| Audit log | No | AuditManager | no `backup()` on the manager; `FileAuditProvider.backup` (settings and counts only) is never called |
| Search index | Yes, the shared Lunr documents; private page text is left out (probe). Elasticsearch: at most the first 10,000 documents. Either can be rebuilt from the pages | SearchManager | `LunrSearchProvider.backup`, `ElasticsearchSearchProvider.backup` (`size: 10000`) |
| Media index and media library | No. The library is the operator's own read-only source files; the index is rebuilt by a rescan | MediaManager | no `backup()` |
| User keywords vocabulary | Yes | CatalogManager | `CatalogManager.backup` |
| Application database and add-on databases | Yes, every declared one, on or off, encrypted under `NGDPBASE_BACKUP_KEY`, one `<stem>.<name>.db` file each beside the document ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)). None without the key; the backup is then reported incomplete. Not seen in the probe, which ran before #1723 merged | DatabaseManager | `DatabaseManager.backup`, `src/providers/sqliteBackup.ts` |
| Add-on data in files under its `dataPath` | No. Of the bundled add-ons, the journal's and calendar's managers return `data: null`; the forms and feeds managers have no `backup()`, so their slot holds an error (not verified on a running add-on) | the add-on's manager | `BackupManager.createBackup` catch |
| Agent tokens | The list only, without the hashes; can't be restored (`restorable: false`) | AgentTokenManager | `AgentTokenManager.backup`, `restore` throws |
| OpenID Connect provider | Client registrations are configuration (`oidc-auth-server.clients`), so they travel with it. Live grants: a list for incident response, can't be restored. Signing and cookie keys: no (`.env`) | OidcManager | `OidcManager.backup`, `restore` throws |
| Shares, notifications, scheduled-job state | No | ShareManager, NotificationManager, BackgroundJobManager | no `backup()` |
| Add-ons on or off | A list only; restore does nothing | AddonsManager | `AddonsManager.backup` |

## Restore today

__Admin → Backup restores only the databases__ ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723), merged as 26a11b58). The site restore of [#1876](https://github.com/jwilleke/ngdpbase/issues/1876) slice 1 stages the databases together with the attachment files, role membership, persons, organizations and public footnotes and comments, but __nothing on Admin → Backup starts it yet__; it is `BackupManager.restoreFromFile` without a filter (below). Pages, users, settings and every other manager's data have no staged restore. The "Restore Data" button and `POST /api/admin/restore` that older documents describe were never built.

### Restoring the databases

The operator's decisions D1 to D6 are in the [decision log](https://github.com/jwilleke/ngdpbase/issues/1723#issuecomment-6248360904). As shipped:

- __Where:__ Admin → Backup → __Restore Databases__ (`POST /admin/backup/restore`, `WikiRoutes.adminBackupRestore`). It needs `config-manage`, with its fresh sign-in when listed in `ngdpbase.auth.step-up`. The card says "Restores the databases only. Pages, users and settings are not changed." (D6).
- __Which backup:__ one already in the backup folder, picked from a list (D1, `BackupManager.findStoredBackup`). There is no upload. A backup that holds no database can't be picked.
- __Confirm:__ type the site name (`ngdpbase.application-name`). The server checks it again and restores nothing when it doesn't match.
- __What happens:__ `BackupManager.startRestore` records `backup-restore` before anything else, and refuses to start if that can't be recorded. In the background it then:
  - 1 takes a complete safety backup of the live data, or stops if any part of it is missing (`restoreFromFile`, `requireComplete`). When the application database can't be opened ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892) D2), the safety backup leaves the databases out and records that (`leftOut` in DatabaseManager's entry, with a note); everything else must still be there. The restore then needs `NGDPBASE_DATABASE_KEY` set, and the card and the "staged" notification say what the safety backup left out;
  - 2 has `DatabaseManager.restore` check the backup key's fingerprint, refusing a backup made with another key;
  - 3 stages each database as `<live>.staged` under the site's database key, all or nothing, with a manifest.
- __Undeclared databases:__ a backed-up add-on database this site doesn't declare is skipped, and admins are told (D4).
- __Notifications:__ admins are notified when the restore is staged, naming the safety backup, or why it wasn't. If it fails, the databases in use are not changed.
- __At the next start:__ before any database opens, each live file and its `-wal`/`-shm` are moved aside as `*.pre-restore` (a damaged file that couldn't be opened included: the failed open wrote nothing to it or its WAL) and the staged file takes its place (`sqliteBackup.applyStagedRestore`). A partial set, an orphan staged file, or a manifest naming a path it shouldn't is set aside as `*.incomplete`, and admins are told. A rename that fails while applying opens no database: the site starts in maintenance mode and admins get "Critical: the application database is not available", with the files left as they were at the failure ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892)). So does a restored file that then doesn't open. The site never restarts itself; the admin restarts it.
- __A staged restore is shown__ on the card: which backup, when it was taken, when staged, by whom, and the safety backup (restoring that undoes this restore). __Cancel staged restore__ (`POST /admin/backup/restore/cancel`) is recorded as `backup-restore-cancel`. __Replace it__ uses the same typed confirmation and is recorded as `backup-restore-replace`. A second restore without replacing is refused (D5).
- __Key:__ the backup needs the `NGDPBASE_BACKUP_KEY` it was made with (D3).

### The staged site restore (#1876 slice 1)

`BackupManager.restoreFromFile(ctx, path)` with no `managerFilter` (or one naming any staged part besides the databases) stages a __site restore__. Every manager whose restore is staged (`restoreIsStaged()`: `DatabaseManager`, `AttachmentManager`, `RoleManager`, `PersonManager`, `OrganizationManager`, `FootnoteManager`, `CommentManager`) does its own part, as Manager-SOT asks, and one record binds the parts together: the site restore manifest, `ngdpbase.backup.restore-manifest` (default `${FAST_STORAGE}/site-restore.json`; `src/utils/siteRestore.ts`).

- __Refused first__ when a site restore or a database restore is already staged (unless `replaceStaged`), or when the backup's entry for any staged part is an error. A databases-only restore (`startRestore`, the Admin → Backup button) is refused while a site restore is staged, since it includes the databases.
- __Then a complete backup of the live data__ (`requireComplete`, `safetyBackup`), as for the databases. It now holds every part above, so restoring it undoes the restore.
- __Then staging, all or nothing.__ The manifest is written in state `staging`; each part stages beside its live data and records the pairs it will swap: the databases as `<file>.staged` (#1723), each folder as `<folder>.staged` (extracted from its `.tar`), the shared pool as `<pool>.staged` with the metadata file written from the document, and each vault's `attachments.staged` and `files-index.json.staged`. A part that fails discards every part already staged, the databases included, and the manifest; the live data is never touched. The manifest is set to `staged` only when every part is: that is the commit. Admins are notified "A site restore is staged", naming the safety backup.
- __A sealed vault never takes plaintext__ (#1836): a vault that must be sealed on this site whose files in the backup are not all sealed bytes refuses the whole staging. A vault the backup has and this site no longer has is not staged, and admins are told.
- __Paths in a backup are data.__ An archive name in the document must be a bare file name in the backup directory; an archive entry that is absolute, climbs out (`..`) or is not a file or folder (a symbolic link) refuses the extract.
- __At the next start__, each owner applies its part before it reads its data (`DatabaseManager` first, before any database opens). A part goes in only when the manifest is committed and every part still pending has all its staged files: then each live path steps aside as `<live>.pre-restore` and the staged one takes its name, a rename, and the part is marked applied in the manifest. Otherwise every part is set aside as `*.incomplete` and nothing of it is applied, the databases included. An owner refuses a manifest naming a path that isn't its own. Staged files with no manifest naming them (an interrupted staging) are set aside. A manifest that can't be read applies nothing and is left as it is, and the parts' managers show degraded.
- __Admins are told__ at the end of the start (`BackupManager`, which starts last): "A site restore was applied", "… was not applied" (with why) or "… was applied only in part" (a rename that failed while applying, or a part whose manager didn't start). The record is kept as `<manifest>.last`.
- `getStagedSiteRestore()` returns the staged manifest; `cancelStagedSiteRestore(ctx)` records `backup-restore-cancel` (refuse) and removes every staged file and the manifest. Neither is on Admin → Backup yet.

### Everything else

Pages (with history, trash and vaults), users, settings, the search index, the user-keywords vocabulary and the add-on list still restore __live__, not staged, if `restoreFromFile` reaches them: after a site restore is staged, its loop still calls each of their `restore()` methods in turn, writing into the running site, with a failure listed, not rolled back. Nothing calls it that way today. `AgentTokenManager` and `OidcManager` refuse by design. The data in the "No" rows above has nothing to come back from. The rest of the whole-site restore is [#1876](https://github.com/jwilleke/ngdpbase/issues/1876).

## What an operator must do today

Only what the code supports:

- __Copy the data folders while the server is stopped.__ Stop with `./server.sh stop`, copy all of `FAST_STORAGE` and `SLOW_STORAGE`, then start again. That copy is the only complete backup: it holds every "No" row above. Stopped matters: the database (SQLite, WAL) and the JSON stores are not safe to copy while they are being written.
- __Keep the keys off the server.__ Save `<FAST_STORAGE>/.env` (or wherever your deployment sets these variables) in a password manager or your cluster's secret store whenever it changes. Without `NGDPBASE_DATABASE_KEY` an encrypted database can't be opened. Without the `NGDPBASE_BACKUP_KEY` a backup was made with, its databases can't be restored; give it a value of its own, not the database key. Without `NGDPBASE_CREDENTIALS_KEY` the credentials store's rows don't verify. Vaults are sealed with each owner's own key in `user-keys.json`, which opens with their password or recovery words, so a copy restores to the password they had when it was taken.
- __Set `NGDPBASE_BACKUP_KEY` if the site has databases__, or no database is backed up at all.
- __Treat a backup as a partial copy.__ Turn on automatic backups: the databases in them can be restored from Admin → Backup. Nothing else in them can be from the page. The document and the `.tar` files beside it hold password hashes, secrets, attachments and records unencrypted, so keep them as safe as the data folder.
- __Restoring anything but the databases means putting the copy back.__ Stop the server, put the copied folders back where they were, with the same `.env`, then start.
- __Media__ is never part of the site's data: back up the library at the storage level.

## Rules for developers and add-on authors

- __A manager that keeps data owns its backup.__ Override `backup()` and `restore()` from `BaseManager`. The default `backup()` returns `data: null`, so a manager that keeps state and doesn't override it is silently left out. Say what is missing as the row in this guide.
- __A manager registered with the engine must have `backup()`.__ `BackupManager` calls it on everything `getRegisteredManagers()` returns. An add-on manager that doesn't extend `BaseManager` (or provide the method) becomes an error slot in every backup.
- __Rows in a database: declare it, don't back it up yourself.__ An add-on that keeps rows declares `ngdpbase.addons.<slug>.database` and opens it with `openAddonDatabase` ([#1860](https://github.com/jwilleke/ngdpbase/issues/1860), [storage guide](storage-developer-guide.md#declaring-a-database)). `DatabaseManager` then backs it up and restores it, on or off ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)); the add-on writes no backup code. Don't write your own copy of a database file.
- __Never write a database backup unencrypted.__ `DatabaseManager` writes database backups only under `NGDPBASE_BACKUP_KEY`, and nothing without it (#1723).
- __A part you couldn't back up goes in `warnings`.__ `BackupData.warnings` is turned into the "A backup is incomplete" admin notification (`DatabaseManager.backup` names each database that failed).
- __A backup never carries anything that could be presented.__ Token hashes, session ids and grant secrets stay out, and `restore()` refuses instead of bringing back half a credential. `AgentTokenManager` and `OidcManager` are the pattern (#1111).
- __Private text stays sealed.__ Vault files go into a backup as stored bytes, never decrypted. A restore never writes plaintext into a sealed vault (`FileSystemProvider.restore`, #1836). Search backups leave private page text out (#1458).
- __Paths in a backup are data.__ A `restore()` resolves every relative path and refuses one that leaves its folder, as `FileSystemProvider` and `VersioningFileProvider` do.
- __Backups are never silent__ (#1563). A part that can't be backed up says so: in the backup itself (like `privateOmitted`), in the log at error level, and to admins.
- __Files go beside the document, never in it__ (#1876). A manager whose data is files writes them as `<stem>.<part>.tar` in `options.directory` (`writeTreeArchive`, or `backupDirectoryPart` for one folder), streamed and as stored, and names the archive in its entry. No file's bytes, base64 or otherwise, go in the JSON.
- __A restore is staged__ (#1723 D1, #1876). New restore code stages for the next start, all or nothing, after a fresh backup of the live data, as `DatabaseManager.restore` does. It never writes into the running site. A manager whose restore is staged returns true from `restoreIsStaged()`, stages beside its live data in `restore(data, { siteRestore })` and records its part (`recordStagedPart`), and applies it at the top of `initialize()` (`applyPartAtStart`, or `applyDirectoryPartAtStart` for one folder) with an `allowed` check naming only its own paths.

## Known gaps

- __A backup file is a secret: treat it like one__ ([#1561](https://github.com/jwilleke/ngdpbase/issues/1561)). The `.json.gz` is not encrypted. It carries the custom configuration with its secrets in plain text (the probe's backup held the SMTP password as written), every user record with its password hash, and the text of vaults that aren't sealed. Keep it as safe as the data folder and `.env`: never on a share others can read, and never sent where you wouldn't send the keys.
- __Admin → Backup restores only the databases__ ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876), P0). The staged site restore (attachments, role membership, persons, organizations, public footnotes and comments, with the databases) has no button and no cancel on the page; it stays that way until the whole-site restore is complete and decided. Pages, users and settings have no staged restore: their `restore()` methods have never run on a real site, and they write live. Restoring them must be staged as the parts above are.
- __A site restore's parts are not one point in time__ (#1876, #1213). Each folder is archived in turn while the site keeps writing, after or before the databases' snapshot, so a role change made during a backup may be in one part and not another.
- __A vault the site no longer has is not restored__ (#1876). Its files in the backup are not staged, and admins are told; its pages have no staged restore either.
- __Vaults on the site that the backup doesn't have keep their files__ (#1876). A site restore swaps only the vaults the backup holds.
- __A backup's completeness is not checked__ (#1876). The inventory above is the first pass. Every "No" row is missing from the backup:
  - The credentials store: passkeys, TOTP, verified email and phone, devices, linked identities, proxy grants ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).
  - The audit log ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).
  - Shares, notifications and scheduled-job state ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).
  - Add-on files under `dataPath`; the forms and feeds managers have no `backup()` at all ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).
- __Key rotation__: an old backup's databases need the backup key they were made with; a restore under another key is refused ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723) D3).
- __No command-line restore for a site that won't start__ (deferred, #1723 D1).
- __A restore while the application database is unavailable can't be undone from Admin → Backup__ ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892) D2). Its safety backup holds no database; undoing it means putting the `*.pre-restore` files back by hand, with the server stopped. Meanwhile an ordinary backup from Admin → Backup is reported incomplete, and automatic backups don't run.
- __A backup is not a snapshot__ ([#1213](https://github.com/jwilleke/ngdpbase/issues/1213)). The databases are copied at one point in time, but the managers are asked one after another while the site keeps writing. A manager that fails leaves an error in its slot. The backup is still written, and admins are told it is incomplete.
- __Stale, unverified, out of space__ ([#1563](https://github.com/jwilleke/ngdpbase/issues/1563)). Nothing says when backups stop. Nothing checks free space first or reads the file back after. A backup by hand that fails outright tells no admin.
- __Private stores over 256 MB are left out whole__ ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238); #1387 closed). The backup is built in memory. Over that size `privateOmitted` is set and an error logged, but no admin is notified, and every vault is missing from the backup.
- __Elasticsearch search backups stop at 10,000 documents__ ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)). It can be rebuilt from the pages.
- __A leftover legacy `pages/private/` folder is not backed up__ ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).
- __Two default-config keys do nothing__: `ngdpbase.backup.compress` and `ngdpbase.backup.auto-backup-interval` ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876#issuecomment-6248952238)).

## Checklist

- [ ] Your manager keeps data: it overrides `backup()` and `restore()`, or its row here says why not
- [ ] Your add-on's registered managers all have `backup()` (extend `BaseManager`)
- [ ] Rows are in a declared database (#1860), not a file you copy yourself
- [ ] No token hash, session id or grant secret in a backup; `restore()` refuses where there is nothing safe to restore
- [ ] Vault bytes are backed up as stored, and a restore never writes plaintext into a sealed vault
- [ ] Every path read from a backup is checked to stay in its folder
- [ ] A part that can't be backed up is recorded in the backup, logged at error level, and reported to admins
- [ ] Any restore you add is staged for the next start, all or nothing, after a fresh backup
- [ ] The inventory table and Known gaps here are updated in the same change
