# BaseManager Complete Guide

__Module:__ `src/managers/BaseManager.js`
__Quick Reference:__ [BaseManager.md](BaseManager.md)
__Generated API:__ [API Docs](../api/generated/src/managers/BaseManager/README.md)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Constructor](#constructor)
3. [Lifecycle Methods](#lifecycle-methods)
4. [State Methods](#state-methods)
5. [Backup and Restore](#backup-and-restore)
6. [API Reference](#api-reference)
7. [Creating a New Manager](#creating-a-new-manager)

---

## Architecture

```text
┌───────────────────────────────────────────────────────────┐
│                     WikiEngine                             │
│  - Creates and manages all managers                        │
│  - Calls initialize() on each manager                      │
└────────────────────────┬──────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  BaseManager  │ │  BaseManager  │ │  BaseManager  │
│  (ACLManager) │ │ (PageManager) │ │ (UserManager) │
└───────────────┘ └───────────────┘ └───────────────┘
```

BaseManager provides:

- Standardized initialization pattern
- Engine reference management
- Lifecycle hooks for startup/shutdown
- Backup/restore interface for data persistence

---

## Constructor

```javascript
constructor(engine) {
  this.engine = engine;
  this.initialized = false;
}
```

__Parameters:__

- `engine` - WikiEngine instance that creates this manager

__Usage:__

```javascript
class MyManager extends BaseManager {
  constructor(engine) {
    super(engine);
    // Initialize instance variables
    this.myData = new Map();
    this.settings = {};
  }
}
```

---

## Lifecycle Methods

### initialize(config)

Called by WikiEngine during startup to initialize the manager.

```javascript
async initialize(config = {}) {
  this.config = config;
  this.initialized = true;
}
```

__Parameters:__

- `config` - Configuration object (optional)

__Returns:__ `Promise<void>`

__Usage in subclass:__

```javascript
async initialize(config = {}) {
  await super.initialize(config);

  // Access other managers
  const configManager = this.engine.getManager('ConfigurationManager');

  // Load your configuration
  this.setting = configManager.getProperty('ngdpbase.mymanager.setting', 'default');

  console.log('MyManager initialized');
}
```

__Important:__ Always call `super.initialize(config)` first in overridden implementations.

---

### shutdown()

Called during graceful shutdown to cleanup resources.

```javascript
async shutdown() {
  this.initialized = false;
}
```

__Returns:__ `Promise<void>`

__Usage in subclass:__

```javascript
async shutdown() {
  // Cleanup resources
  await this.saveState();
  await this.closeConnections();

  // Call super last
  await super.shutdown();
}
```

__Important:__ Always call `super.shutdown()` at the end of overridden implementations.

---

## State Methods

### isInitialized()

Check if manager has been initialized.

```javascript
isInitialized() {
  return this.initialized;
}
```

__Returns:__ `boolean`

__Usage:__

```javascript
const pageManager = engine.getManager('PageManager');
if (pageManager.isInitialized()) {
  const page = await pageManager.getPage('Main');
}
```

---

### getEngine()

Get the WikiEngine instance.

```javascript
getEngine() {
  return this.engine;
}
```

__Returns:__ `WikiEngine`

__Usage:__

```javascript
// Access other managers from within a manager
const userManager = this.getEngine().getManager('UserManager');
const configManager = this.getEngine().getManager('ConfigurationManager');
```

---

## Backup and Restore

BaseManager provides backup/restore methods that MUST be overridden by managers with persistent data.

### backup()

Create a backup of manager state.

```javascript
async backup() {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: null
  };
}
```

__Returns:__ `Promise<Object>` with structure:

- `managerName` - Name of the manager class
- `timestamp` - ISO timestamp of backup
- `data` - Manager-specific backup data

__Override example:__

```javascript
async backup() {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

---

### restore(backupData)

Restore manager state from backup.

```javascript
async restore(backupData) {
  if (!backupData) {
    throw new Error(`${this.constructor.name}: No backup data provided for restore`);
  }
}
```

__Parameters:__

- `backupData` - Backup object from `backup()` method

__Returns:__ `Promise<void>`

__Throws:__ `Error` if backupData is missing

__Override example:__

```javascript
async restore(backupData) {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }

  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
```

---

## API Reference

### Constructor

| Method | Parameters | Description |
| -------- | ------------ | ------------- |
| `constructor(engine)` | WikiEngine | Create manager with engine reference |

### Lifecycle Methods

| Method | Parameters | Returns | Description |
| -------- | ------------ | --------- | ------------- |
| `initialize(config)` | Object (optional) | `Promise<void>` | Initialize manager |
| `shutdown()` | - | `Promise<void>` | Shutdown manager |

### State Methods

| Method | Parameters | Returns | Description |
| -------- | ------------ | --------- | ------------- |
| `isInitialized()` | - | `boolean` | Check initialization state |
| `getEngine()` | - | `WikiEngine` | Get engine reference |

### Backup/Restore Methods

| Method | Parameters | Returns | Description |
| -------- | ------------ | --------- | ------------- |
| `backup()` | - | `Promise<Object>` | Create backup of manager data |
| `restore(backupData)` | Object | `Promise<void>` | Restore from backup |

---

## Creating a New Manager

### Step 1: Create the Manager Class

```javascript
const BaseManager = require('./BaseManager');

class MyManager extends BaseManager {
  constructor(engine) {
    super(engine);
    this.myData = new Map();
  }

  async initialize(config = {}) {
    await super.initialize(config);

    // Get configuration
    const configManager = this.engine.getManager('ConfigurationManager');
    this.setting = configManager.getProperty('ngdpbase.mymanager.setting', 'default');

    console.log('MyManager initialized');
  }

  async shutdown() {
    await this.saveData();
    await super.shutdown();
  }

  // Your manager methods
  async doSomething(input) {
    // Implementation
  }
}

module.exports = MyManager;
```

### Step 2: Register in WikiEngine

Add the manager to `WikiEngine.js`:

```javascript
// In WikiEngine constructor or initialization
this.managers.set('MyManager', new MyManager(this));
```

### Step 3: Initialize Order

Ensure proper initialization order in WikiEngine if your manager depends on others:

```javascript
// ConfigurationManager must initialize first
await this.getManager('ConfigurationManager').initialize();

// Then other managers that depend on it
await this.getManager('MyManager').initialize();
```

---

## Notes

- __Abstract class:__ BaseManager is meant to be extended, not used directly
- __Engine reference:__ Always available via `this.engine` or `this.getEngine()`
- __Configuration:__ Use ConfigurationManager for all configuration access
- __23 managers:__ ngdpbase has 23 specialized managers extending BaseManager

---

## Related Documentation

- [BaseManager.md](BaseManager.md) - Quick reference
- [MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md) - All managers
- [WikiEngine](../WikiEngine.md) - Engine that creates managers
- [ConfigurationManager](ConfigurationManager.md) - Configuration access
