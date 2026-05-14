---
name: BaseManager
description: "Abstract base class for all managers — engine wiring, lifecycle hooks, config accessor pattern"
dateModified: '2026-05-14'
category: managers
code: src/managers/BaseManager.ts
---

# BaseManager

**Module:** `src/managers/BaseManager.ts`
**Complete Guide:** [BaseManager-Complete-Guide.md](BaseManager-Complete-Guide.md)

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
| `backup()` | Backup manager data |
| `restore(backupData)` | Restore from backup |
| `toMarqueeText(options)` | Return plain-text summary for [MarqueePlugin](../plugins/MarqueePlugin.md). Default returns `''`. Override in subclasses. |

## Properties

| Property | Type | Description |
| ---------- | ------ | ------------- |
| `engine` | WikiEngine | Reference to wiki engine |
| `initialized` | boolean | True after initialize() |
| `config` | Object | Config passed to initialize() |

## Managers Extending BaseManager

All managers in `src/managers/` extend BaseManager:

- [ACLManager](ACLManager.md)
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
