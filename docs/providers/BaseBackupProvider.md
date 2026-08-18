---
name: BaseBackupProvider
description: Abstract base class for backup storage providers — abstracts the storage target only (#170)
dateModified: '2026-05-16'
category: providers
code: src/providers/BaseBackupProvider.ts
---

# BaseBackupProvider

__Quick Reference__ | [BackupManager](../managers/BackupManager.md)

__Module:__ `src/providers/BaseBackupProvider.ts`
__Type:__ Abstract Backup Provider Base Class
__Status:__ Production

---

## Overview

`BaseBackupProvider` (Issue #170) abstracts __only the backup storage
target__ — where the assembled archive is written, read, listed, and pruned.
It deliberately does __not__ re-abstract the content side: collecting
`backup()` from every manager, gzip, JSON, validation, retention policy, and
the auto-backup scheduler all remain in [BackupManager](../managers/BackupManager.md),
because per-manager serialization was already provider-abstracted via
`manager.backup()`.

Unlike [BaseLoggingProvider](BaseLoggingProvider.md) (#169), backup runs well
after engine init, so the standard engine + `initialize()` provider shape
applies (same as Search/Audit/Cache).

## Abstract Interface

```typescript
abstract class BaseBackupProvider {
  constructor(engine: WikiEngine);

  abstract initialize(): Promise<void>;
  abstract getBackupDirectory(): string;
  abstract ensureContainer(): Promise<void>;
  abstract writeBackup(filename: string, data: string | Buffer): Promise<string>;
  abstract readBackup(idOrPath: string): Promise<Buffer>;
  abstract backupExists(idOrPath: string): Promise<boolean>;
  abstract listBackupObjects(): Promise<BackupObjectInfo[]>;
  abstract removeBackup(idOrPath: string): Promise<void>;
  abstract setBackupDirectory(directory: string): Promise<void>;

  getProviderInfo(): BackupProviderInfo;
  isHealthy(): Promise<boolean>;
}
```

## Related

- [FileBackupProvider](FileBackupProvider.md) — default local-filesystem implementation
- [BackupManager](../managers/BackupManager.md) — orchestration / serialization
- Config key: `ngdpbase.backup.provider` (default `filebackupprovider`)
