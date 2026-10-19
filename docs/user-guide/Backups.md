# ngdpbase Backup Guide

## Overview

A backup made from __Admin → Backup__ is a partial copy of the site. It holds most of the site's data, and __only its databases can be restored from Admin → Backup__. A complete, restorable copy is still the data folders, copied while the server is stopped, plus the keys kept somewhere else.

The full, current detail — every kind of data, what restores, and every known gap — is in the [backup and restore guide](../guides/backup-restore-guide.md). This page is the short version.

---

## Making a backup

- __By hand:__ Admin → Backup → __Create & Download Backup__. The backup is written to the server's backup folder and downloaded as one `.tar`.
- __Automatically:__ turn on automatic backups on Admin → Backup, with a time of day and the days to run. A backup missed while the server was down runs when it is back.
- The server keeps the last 10 backups (`ngdpbase.backup.max-backups`), each with the files beside it.

A backup is one document, `<timestamp>-ngdpbase-backup.json.gz.enc`, and the files beside it: each database as its own encrypted `.db` file, and each folder of files as a `.tar.enc` (attachments, vault files, role membership, persons, organizations, footnotes, comments, the credentials store, the audit log, file-based job state, add-on files). With `NGDPBASE_BACKUP_KEY` set every one of them is encrypted under it; without it the names end `.json.gz` and `.tar`, and nothing is encrypted (below).

### What IS in a backup

| Data | Where in the backup |
| --- | --- |
| Pages, their history and trash (history and trash with `versioningfileprovider`) | the document |
| Private stores (vaults): pages, history, footnotes, comments, keys — as stored, sealed files still sealed | the document (none of it when the vaults are over 256 MB together) |
| Attachment files in the shared pool | `<stem>.attachments.tar` |
| Vault files (attachments on vault pages), as stored — never decrypted | `<stem>.vault-attachments.tar` |
| Attachment metadata | the document |
| Footnotes and comments on public pages | `<stem>.footnotes.tar`, `<stem>.comments.tar` |
| Users (accounts, password hashes, preferences) | the document |
| Role membership (who holds which role), persons, organizations | `<stem>.roles.tar`, `<stem>.persons.tar`, `<stem>.organizations.tar` |
| Settings (`app-custom-config.json`, secrets included) | the document |
| The search index and the keyword vocabulary | the document |
| The application database and add-on databases (with `NGDPBASE_BACKUP_KEY` set) | `<stem>.<name>.db`, encrypted |
| Passkeys, authenticator apps, verified email and phone, known devices, linked sign-ins, proxy grants (with `NGDPBASE_BACKUP_KEY` set; never unencrypted) | `<stem>.credentials.tar.enc` |
| The audit log, with its hash chain | `<stem>.audit.tar.enc` |
| Scheduled-job state kept in files (with a database it is in the database copy) | `<stem>.jobs.tar.enc` |
| Add-on files: forms and submissions, calendars, feed records | `<stem>.forms.tar.enc`, `<stem>.calendar.tar.enc`, `<stem>.feeds.tar.enc` |

### What is NOT in a backup

| Data | How to keep it |
| --- | --- |
| `.env` and the keys in it | keep a copy in a password manager or secret store |
| Shares, notifications | copy `$FAST_STORAGE/` |
| Sign-in sessions | not needed: people sign in again |
| Media files and the media index | back up your media folders at the storage level; the index is rebuilt by a rescan |

### Encryption

- __With `NGDPBASE_BACKUP_KEY` set__ every file of a backup is encrypted under it: the document, every `.tar.enc` and the databases. Each records a short fingerprint of the key (never the key); a restore under another key is refused, and one without the key can't read anything.
- __Without it__ the backup is __not encrypted__: the document holds password hashes and settings with their secrets, the `.tar` files hold attachments and records as they are on disk. The credentials store and the databases are left out. Every such backup notifies admins ("A backup is incomplete" or "A backup is not encrypted"). A restore of the rest of the site also needs the key, since it starts with a complete backup of the live data.

---

## Databases

When `ngdpbase.database.provider` is `sqlite`, every backup also copies the application database and every declared add-on database, on or off ([#1723](https://github.com/jwilleke/ngdpbase/issues/1723)):

- Encrypted under `NGDPBASE_BACKUP_KEY` (environment or instance `.env`, never config; use a value different from `NGDPBASE_DATABASE_KEY`). Keep a copy of the key outside the backups.
- Without the key no database is backed up and nothing unencrypted is written; the dashboard shows the database manager degraded and each backup notifies admins that it is incomplete.
- All databases are copied at one point in time, on a worker thread, while the site runs.
- `ngdpbase.database.backup.worker-timeout-ms` (default `3600000`) caps how long the copy may run.

---

## Restoring

### The databases (Admin → Backup)

__Admin → Backup → Restore Databases__: pick a backup stored on the server, type the site name, and restart when the notification says it is staged. A fresh backup of the current data is taken first, the databases are prepared beside the live files, all or nothing, and the next start puts them in place, keeping the old files as `*.pre-restore`. A staged restore is shown there and can be cancelled or replaced. __Only the databases are restored__; pages, users and settings are not changed. Details: [DatabaseManager.md](../managers/DatabaseManager.md#backup-and-restore).

### Everything else

Nothing on Admin → Backup restores anything but the databases yet ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)). The attachment files, role membership, persons, organizations, footnotes and comments, the credentials store, the audit log, file-based job state and add-on files in a backup can be restored together with the databases, staged for the next start, by the site restore that #1876 is building; it has no button yet.

### Not restored

After any restore is put in place, admins get a __critical__ notification ("Critical: a restore did not bring everything back") listing what it did not bring back. The list is known before a restore too:

- shares and notifications (they stay as they are), sign-in sessions, the keys in `.env`, the media index — no backup holds them;
- pages, user accounts and settings — they have no staged restore yet;
- for a databases-only restore, everything but the databases;
- anything the backup left out, such as the credentials store of a backup taken without the key.

The notification also names each scheduled job that ran between the backup and the restore, with its last run time and result. Those runs are not in the restored job history, and a restore never runs a job again: a run the backup caught in progress is closed as cut off, and each schedule goes on from the next time after the restart. Decide yourself whether any of them needs running again.

To bring back anything else today: stop the server (`./server.sh stop`), put the copied `$FAST_STORAGE` and `$SLOW_STORAGE` folders back where they were, with the same `.env`, and start it again.

---

## What About Media Files?

Media files (photos, videos in your media library) are __never__ included in the ngdpbase backup: ngdpbase indexes them but does not own them, and they are usually far too large. __Back up media files at the storage/NAS level.__ The media index can be rebuilt at any time with a rescan.
