---
name: BaseManager
description: "Abstract base class for all managers — engine wiring, lifecycle hooks, config accessor pattern"
dateModified: '2026-10-22'
category: managers
code: src/managers/BaseManager.ts
---

# BaseManager

__Module:__ `src/managers/BaseManager.ts`
__Complete Guide:__ [BaseManager-Complete-Guide.md](BaseManager-Complete-Guide.md)

---

## Overview

BaseManager is the abstract base class that all ngdpbase managers extend. It provides common functionality for initialization, lifecycle management, and backup/restore operations following JSPWiki's modular manager pattern.

## Key Features

- Standard lifecycle: `initialize()` → use → `shutdown()`
- WikiEngine reference for accessing other managers
- Backup/restore interface for disaster recovery
- Initialization state tracking

## Quick Example

```javascript
const BaseManager = require('./BaseManager');

class MyManager extends BaseManager {
  constructor(engine) {
    super(engine);
    this.myData = new Map();
  }

  async initialize(config = {}) {
    await super.initialize(config);
    // Custom initialization
  }

  async shutdown() {
    this.myData.clear();
    await super.shutdown();
  }
}
```

## Core Methods

| Method | Description |
| -------- | ------------- |
| `constructor(engine)` | Receive WikiEngine reference |
| `initialize(config)` | Initialize the manager |
| `isInitialized()` | Check initialization state |
| `getEngine()` | Get WikiEngine reference |
| `shutdown()` | Clean shutdown |
| `backupFolders()` | The folders and files this manager keeps its data in; BackupManager backs them up, stages and applies them. Default none (below) |
| `backup()` | Backup manager data kept in the document (JSON) |
| `restore(backupData)` | Restore from backup |
| `restoreIsStaged()` | Whether a restore is staged for the next start; true by default for a manager that declares folders |
| `toMarqueeText(options)` | Return plain-text summary for [MarqueePlugin](../plugins/MarqueePlugin.md). Default returns `''`. Override in subclasses. |

## Declaring your data folders

A manager whose data is a folder of files, or one file, declares it and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)):

```ts
override backupFolders(): BackupFolder[] {
  return [{ part: 'roles', folder: this.storageDir ?? this.configuredStorageDir() }];
}
```

- `part` names the archive, `<stem>.<part>.tar` (`.tar.enc` under the backup key). Never rename it: old backups are matched by it.
- `folder` is resolved from the configuration, so it can be answered before the subclass's own `initialize()` has run; null when the site has none configured.
- `exclude(relative)` leaves out paths (job state's slot locks); `optional: true` lets a backup without the part stage nothing for it instead of refusing the restore.
- One file instead of a folder: `{ part, file, what, whenAbsent, requireKey?, optional? }`. `requireKey` backs it up only encrypted under the backup key, and leaves it out with a warning otherwise (the credentials store).

BackupManager archives each declared part beside the backup document, stages it in a site restore, and puts the staged copy in place at the next start. That last step is in `BaseManager.initialize()`, before it returns, so __call `super.initialize()` first, before you read the folder__. The outcome is `stagedRestoreAtStart()` (what was applied, and when the backup was taken); a part not applied marks the manager as needing attention. A manager may still keep data in the document through `backup()`: each declared part's record then goes beside it, as `data[<part>]` (the credentials store beside AuthManager's provider list); with no data of its own and one part, the record is the entry's `data`. A manager stages either through declarations or through its own `restore()` with `restoreIsStaged()`, not both; the latter records its part through `options.siteRestore` (`SiteRestoreStaging`: `stagedPathFor`, `record`) and applies it through BackupManager's `applyStagedPartAtStart` or `siteRestorePartAtStart`, never the record itself ([#1986](https://github.com/jwilleke/ngdpbase/issues/1986)). The rules are in the [backup and restore guide](../guides/backup-restore-guide.md#rules-for-developers-and-add-on-authors).

## Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `engine` | WikiEngine | Reference to wiki engine |
| `initialized` | boolean | True after initialize() |
| `config` | Object | Config passed to initialize() |

## Managers Extending BaseManager

All managers in `src/managers/` extend BaseManager:

- [PolicyInformationPoint](PolicyInformationPoint.md)
- [AttachmentManager](AttachmentManager.md)
- [AuditManager](AuditManager.md)
- [CacheManager](CacheManager.md)
- [ConfigurationManager](ConfigurationManager.md)
- [ExportManager](ExportManager.md)
- [NotificationManager](NotificationManager.md)
- [PageManager](PageManager.md)
- [PluginManager](PluginManager.md)
- [PolicyManager](PolicyManager.md)
- [RenderingManager](RenderingManager.md)
- [SchemaManager](SchemaManager.md)
- [SearchManager](SearchManager.md)
- [TemplateManager](TemplateManager.md)
- [UserManager](UserManager.md)
- [ValidationManager](ValidationManager.md)
- [VariableManager](VariableManager.md)

## Plugin Content Methods

Managers can expose live data to plugins by overriding standard methods.
These methods receive a raw `Record<string, string>` options object parsed
from the plugin's `fetch=` parameter.

### `toMarqueeText(options)`

Returns a single-line plain-text string for use by [MarqueePlugin](../plugins/MarqueePlugin.md).

```ts
import { parseManagerFetchOptions } from '../utils/managerUtils';

async toMarqueeText(raw: Record<string, string> = {}): Promise<string> {
  const { limit } = parseManagerFetchOptions(raw);
  const items = await this.getRecentItems(limit ?? 5);
  return items.length === 0 ? '' : items.map(i => i.title).join('  •  ');
}
```

Wiki usage:

```wiki
[{MarqueePlugin fetch='MyManager.toMarqueeText(limit=5,sort=date-desc)'}]
```

Common options (`limit`, `sort`, `sortBy`, `sortOrder`, `since`, `before`) are
parsed by `parseManagerFetchOptions()` from `src/utils/managerUtils.ts`.
Domain-specific options are read directly from the raw object.

## Developer Documentation

For complete API reference and implementation patterns, see:

- [BaseManager-Complete-Guide.md](BaseManager-Complete-Guide.md)
- [Generated API Docs](../api/generated/src/managers/BaseManager/README.md)
