# ngdpbase Backup Guide

## Overview

ngdpbase has two layers of data that require different backup strategies:

1. __Structured data__ (configuration, users, ACLs, attachment metadata) — backed up by the built-in __Backup Data__ button
2. __File data__ (wiki page files, attachment binaries, media files) — must be backed up separately using your OS or NAS backup tools

__A complete backup requires both.__

---

## The "Backup Data" Button

Found at __Admin → Data Management → Backup Data__.

Clicking this button:

1. Calls `backup()` on every registered manager in sequence
2. Aggregates all results into a single JSON document
3. Compresses it with gzip
4. Downloads the file to your browser as `<timestamp>-ngdpbase-backup.json.gz`

The server also retains the last 10 backup files in its backup directory (configurable via `ngdpbase.backup.max-backups`).

### What IS included in the backup file

| Data | Manager | Status |
|------|---------|--------|
| Configuration settings | ConfigurationManager | ✅ Included |
| User accounts and roles | UserManager | ✅ Included |
| Access control lists | ACLManager | ✅ Included |
| Attachment metadata (filenames, hashes, page links) | AttachmentManager | ✅ Included |
| Search index | SearchManager | ✅ Included |

### What is NOT included in the backup file

| Data | Why | How to back up |
|------|-----|----------------|
| __Wiki page files__ (`.md` files) | FileSystemProvider does not yet implement backup() | Copy `$SLOW_STORAGE/pages/` directory |
| __Attachment binaries__ (images, PDFs, etc.) | Only metadata is backed up, not the files themselves | Copy `$SLOW_STORAGE/attachments/` directory |
| __Media files__ | External files managed by FileSystemMediaProvider; not part of the wiki data store | Back up your media source folders directly |
| __Versions/history__ | Page version history lives in the filesystem alongside pages | Copy `$SLOW_STORAGE/pages/` (versions are stored inline) |

> __Important:__ The Backup Data button is __not a complete backup__. Without a filesystem-level copy of your pages and attachments, you cannot fully restore the wiki from the `.json.gz` file alone.

---

## Recommended Backup Strategy

### Step 1 — Download the structured backup

Use __Admin → Data Management → Backup Data__ to download the `.json.gz` file.
Store it somewhere safe (cloud storage, external drive, etc.).

### Step 2 — Back up the filesystem data

Copy or snapshot the following directories:

| Directory | Contains |
|-----------|----------|
| `$SLOW_STORAGE/pages/` | All wiki page markdown files and version history |
| `$SLOW_STORAGE/attachments/` | All uploaded attachment binary files |
| `$FAST_STORAGE/` | Users, sessions, config overrides, search index, logs |

> On a standard install, `FAST_STORAGE` defaults to `./data` and `SLOW_STORAGE` is set in your `.env` file. Check your instance's `.env` to find the exact paths.

### Step 3 — Back up media (if applicable)

Media files (photos, videos) are stored in your configured media source folders (`ngdpbase.media.folders`). These are __read-only__ to ngdpbase and must be backed up independently — typically via your NAS or storage system's own backup tools.

The media index file (default: `$FAST_STORAGE/media-index.json`) is rebuilt on the next scan and does not need to be backed up, but backing it up avoids a full rescan after restore.

---

## Restoring from a Backup

### Restore structured data

1. Go to __Admin → Data Management → Restore Data__
2. Upload the `.json.gz` backup file
3. The server will call `restore()` on each manager in sequence

> Restore replaces live data. Stop traffic to the wiki before restoring in a production environment.

### Restore filesystem data

Copy your backed-up `pages/`, `attachments/`, and `$FAST_STORAGE/` directories back to their original locations, then restart the server.

---

## Auto Backup (Not Yet Active)

The configuration supports automatic scheduled backups:

```json
"ngdpbase.backup.auto-backup": false,
"ngdpbase.backup.auto-backup-interval": 86400000
```

Setting `autoBackup` to `true` and `autoBackupInterval` to a millisecond interval (default: 86400000 = 24 hours) is planned but __not yet implemented__. See [#258](https://github.com/jwilleke/ngdpbase/issues/258) for status.

Until auto backup is active, schedule a recurring manual backup or use an OS-level cron job to copy your data directories.

---

## Backup Granularity (Planned — #258)

Issue [#258](https://github.com/jwilleke/ngdpbase/issues/258) tracks adding selective backup options:

- Configuration only
- Pages only
- Attachments only
- Pages + Attachments
- Full backup (all of the above)
- Scheduled/automatic backups

Currently only a full structured backup is available via the Backup Data button.

---

## What About Media Files?

Media files (photos, videos in your media library) are __never__ included in the ngdpbase backup, for two reasons:

1. They are treated as read-only source files — ngdpbase indexes them but does not own them
2. They are typically very large (gigabytes to terabytes) and impractical to include in an application-level backup

__Back up media files at the storage/NAS level__, independent of ngdpbase.

The media index (`media-index.json`) can be regenerated at any time via __Admin → Media → Rescan__. You do not need to restore it manually.
