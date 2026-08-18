---
name: FileBackupProvider
description: Default backup storage provider — local filesystem against ngdpbase.backup.directory (#170)
dateModified: '2026-05-16'
category: providers
code: src/providers/FileBackupProvider.ts
---

# FileBackupProvider

__Quick Reference__ | [BaseBackupProvider](BaseBackupProvider.md)

__Module:__ `src/providers/FileBackupProvider.ts`
__Type:__ Backup Provider (default)
__Status:__ Production

---

## Overview

`FileBackupProvider` is the default backup storage target (Issue #170). It is
the local-filesystem I/O `BackupManager` performed inline before #170
(fs-extra against `ngdpbase.backup.directory`), extracted verbatim behind
[BaseBackupProvider](BaseBackupProvider.md) so the backend is swappable
without changing orchestration or serialization. Backup behaviour is
unchanged.

## Behaviour

- __Directory:__ resolved via `ConfigurationManager.getResolvedDataPath('ngdpbase.backup.directory', './data/backups')` in `initialize()` (supports `INSTANCE_DATA_FOLDER`), then `ensureDir`'d.
- __Path resolution:__ absolute paths (from `listBackupObjects()` / `writeBackup()`) pass through; bare filenames resolve against the backup directory — so `restoreFromFile()` still accepts the absolute paths callers pass today.
- __`listBackupObjects()`__ returns *all* objects in the directory; `BackupManager` applies its own backup-naming filter.
- __`setBackupDirectory()`__ re-points the target at runtime when an admin changes the directory via the auto-backup config UI.

## Selection

Selected by `ngdpbase.backup.provider: "filebackupprovider"` (the default).
`BackupManager.normalizeProviderName()` maps the lowercase config name to the
class; unknown names fall back to `FileBackupProvider`.

## Related

- [BaseBackupProvider](BaseBackupProvider.md) — abstract contract
- [BackupManager](../managers/BackupManager.md)
