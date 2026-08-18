# Backing Up ngdpbase

## Managers MUST incldue Backup

Create src/managers/BackupManger
src/managers/BackupManger should be able to create single *.gz file to perform a backup().
src/managers/BackupManger MUST have a single backup() fuction which will call every other src/managers/*Manager backup() fuction
src/managers/BackupManger MUST have a single restore() fuction which will call every other src/managers/*Manager restore() fuction

We will require but not do yet
All src/*Managers MUST have a single backup() function to perform a backup of the data they accoutnable to manage.
All src/*Managers MUST have a single restore() function to perform a restore of the data they accoutnable to manage.

But add it to src/managers/BaseManager.js

BackupManager Implementation Complete ✅
Created Files:
src/managers/BackupManager.js - Full implementation with backup/restore orchestration
Modified Files:
src/managers/BaseManager.js - Added backup()/restore() interface methods
src/core/Engine.js - Added getRegisteredManagers() method
src/WikiEngine.js - Added BackupManager import
src/WikiEngine.js - Added BackupManager initialization
config/app-default-config.json - Added backup configuration properties

## BackupManger Key Features

- Creates single compressed .gz backup files
- Calls backup() on all registered managers
- Calls restore() on all managers from backup file
- Automatic cleanup of old backups (keeps last 10)
- Comprehensive error handling and logging
- Helper methods: listBackups(), getLatestBackup()

## BackupManger Status

- BackupManager is initialized and running ✅
- Interface defined in BaseManager ✅
- Server running normally ✅
- Ready for individual manager implementations (future work as specified by user)

## BackupManger Configuration entries

``` json
  "_comment_backup": "Backup and restore configuration for BackupManager",
  "ngdpbase.backup.directory": "./backups",
  "ngdpbase.backup.max-backups": 10,
  "ngdpbase.backup.compress": true,
  "ngdpbase.backup.auto-backup": false,
  "ngdpbase.backup.auto-backup-interval": 86400000
```

## BackupManger TODOs

- src/managers/PageManager MUST have backup for regular "ngdpbase.directories.pages": "./pages"
- src/managers/PageManager SHOULD have backup for "ngdpbase.directories.required-pages": "./required-pages",
- src/managers/ConfigurationMaanger MUST have Backup for all Config data
- src/managers/UserManager.js MUST have back for all USER data including Audit Data
- /src/managers/TemplateManager.js MUST have Backup for all Template data
- src/managers/VariableManager.js MUST have Backup for Varibele data
- src/managers/PluginManager.js MUST have Backup for Plugin data
- src/managers/ExportManager.js should only need to call instances for Managers backup()

## Registered Managers

"Registered managers" are all manager instances that have been registered with the WikiEngine via engine.registerManager(name, instance).
> You can see the complete list in WikiEngine.js:65-129:

- ConfigurationManager
- UserManager
- NotificationManager
- PageManager
- TemplateManager
- PolicyManager
- PolicyValidator
- PolicyEvaluator
- ACLManager
- PluginManager
- MarkupParser
- RenderingManager
- SearchManager
- ValidationManager
- VariableManager
- SchemaManager
- ExportManager
- AttachmentManager
- BackupManager (skips itself during backup)

The BackupManager retrieves this list via engine.getRegisteredManagers() at BackupManager.js:96.

### Managers - Providers

Some managers which store data on a Stoarge Media use "Providers" to perform the actual interactions with the different "Stoarge Media".
This relationship is determine by the src/managers/ConfigurationManager.js settings.

PageManager for instance

- const providerName = configManager.getProperty('ngdpbase.pageProvider', 'FileSystemProvider');
- then PageManager delegaates "Stoarge Media" calls to the providerName.
- This requuires providerName to perform all interations with the "Stoarge Media" (which could bs a database)

For "Stoarge Media" backups this requires providerName to implement a Backup() and Restore() functions that are called by the Manager which will return either:

- return file reference to a specific .gz file
- manifest??.json  # Contains all data inline

The choice whould be based on src/managers/ConfigurationManager.js entries of

```json
{
  "ngdpbase.backup.strategy": "auto",  // auto|inline|file
  "ngdpbase.backup.inlineThreshold": 100,  // Max items for inline
  "ngdpbase.backup.compressFolder": true,  // Create .tar.gz
  "ngdpbase.backup.parallelProviders": true  // Backup providers concurrently
}
```

#### Backup Logic (pseudocode)

Update providerName to support both modes:

```javascript
class BasePageProvider {
  /**
   * Backup strategy - determines if provider should create files
   * @returns {'inline'|'file'} Backup type
   */
  getBackupStrategy() {
    // Default: inline for small data
    return 'inline';
  }
  
  async backup() {
    if (this.getBackupStrategy() === 'file') {
      return await this.backupToFile();
    }
    return await this.backupInline();
  }
  
  async backupInline() {
    // Return JSON-serializable data
  }
  
  async backupToFile() {
    // Create .gz file, return file reference
  }
}
```

#### Restore Logic (pseudocode)

``` javascript
async restore(backupPath) {
  // Detect backup type
  const isFolder = (await fs.stat(backupPath)).isDirectory();
  const isTarGz = backupPath.endsWith('.tar.gz');
  
  if (isTarGz) {
    // Extract .tar.gz first
    backupPath = await this.#extractTarGz(backupPath);
  }
  
  // Load manifest
  const manifest = JSON.parse(
    await fs.readFile(path.join(backupPath, 'manifest.json'))
  );
  
  // Restore each manager
  for (const [managerName, backup] of Object.entries(manifest.managers)) {
    const manager = this.engine.getManager(managerName);
    
    if (backup.type === 'file') {
      // Load data from separate file
      const filePath = path.join(backupPath, backup.file);
      const data = await this.#loadBackupFile(filePath);
      await manager.restore(data);
    } else {
      // Inline data
      await manager.restore(backup.data);
    }
  }
}
```

### Examples of Non-Data Managers

- PolicyManager - Loads policies from config at startup, no persistent state
- VariableManager - Registers handlers at initialization, no stored data
- RenderingManager - Builds runtime link graphs, stateless rendering
- PolicyValidator - Pure validation logic, no data
- PolicyEvaluator - Pure evaluation logic, no data
- PluginManager - Discovers plugins at runtime
- MarkupParser - Stateless parsing
- Data Managers (override backup/restore):
- AttachmentManager - Stores file attachments (delegates to provider)
- PageManager - Stores wiki pages (likely delegates to provider)
- UserManager - Stores user accounts and profiles
- ACLManager - Stores access control lists
- SearchManager - Stores search indexes

### How Non-Data Managers Interact with BackupManager

The interaction is graceful and automatic:

- During Backup (BackupManager.js:100-127):
  - BackupManager calls manager.backup() on every registered manager
  - Non-data managers return { managerName, timestamp, data: null }
  - This minimal data is included in the backup file
  - If a manager throws an error, it's caught and logged, continuing with others
- During Restore (BackupManager.js:220-255):
  - BackupManager calls manager.restore(backupData) on every manager
  - Non-data managers receive their backup data and validate it
  - The default implementation does nothing (no data to restore)
  - Configuration-driven managers (like PolicyManager) will reload from config on next initialization
- Benefits:
  - No special handling needed - All managers use the same interface
  - Self-documenting backups - The backup file shows all managers present
  - Safe degradation - Non-data managers don't fail during backup/restore
  - Future-proof - If a manager evolves to manage data, just override the methods

### Can We Identify Non-Data Managers?

Yes, programmatically: You could check if a manager uses the default implementation:
const hasCustomBackup = manager.backup !== BaseManager.prototype.backup;
Yes, by inspection: Look for:

- Managers that load config at initialization only
- Managers with no file I/O or database operations
- Managers that build runtime caches/indexes from other sources
- Managers that provide pure functions (validators, evaluators)

## What Data Managers Return to BackupManager

Based on the codebase analysis, here's what data managers return during backup operations and how they handle their data:
📊 Data Structure Overview

Data managers return a JSON-serializable object to the BackupManager, which aggregates all manager backups into a single compressed .gz file.

The backup structure at BackupManager.js:88-93 is:

```json
{
  version: '1.0.0',
  timestamp: '2025-10-10T...',
  application: 'ngdpbase',
  managers: {
    'AttachmentManager': { ... },
    'PageManager': { ... },
    'UserManager': { ... },
    // etc.
  }
}
```

### Non-Data Managers

"Non-data" managers are those that don't manage persistent state and only provide runtime services. They inherit the default backup() and restore() methods from BaseManager.js:50-74, which return minimal metadata:

```javascript
async backup() {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: null
  };
}

async restore(backupData) {
  // Does nothing - just validates backupData exists
}
```

## What Each Type of Manager Returns

### Non-Data Managers (Default Implementation)

"Non-data" managers are those that don't manage persistent state and only provide runtime services. They inherit the default backup() and restore() methods from BaseManager.js:50-74, which return minimal metadata:

```javascript
async backup() {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: null
  };
}

async restore(backupData) {
  // Does nothing - just validates backupData exists
}
```

Examples: PolicyManager, VariableManager, RenderingManager, ValidationManager

## Some of "Data" Managers

These were "cherry" picked. ALL managers need evaluated further.

### AttachmentManager (AttachmentManager.js:353-371)

Returns metadata references delegating to its provider:

```javascript
{
  managerName: 'AttachmentManager',
  timestamp: '2025-10-10T...',
  providerClass: 'BasicAttachmentProvider',
  providerBackup: {
    providerName: 'BasicAttachmentProvider',
    timestamp: '2025-10-10T...',
    metadataFile: './data/attachments/BasicAttachmentProvider.json',
    storageDirectory: './data/attachments',
    attachments: [
      ['hash1', { /* Schema.org CreativeWork metadata */ }],
      ['hash2', { /* Schema.org CreativeWork metadata */ }]
    ]
  }
}
```

#### What's backed up

✅ Attachment metadata (Schema.org format)
✅ File information (names, sizes, MIME types)
✅ Page mentions/relationships
✅ Author/editor information
✅ Storage paths

#### What's NOT backed up

❌ Actual file contents (binaries stay in filesystem) --> __MUST include__
Storage Model: The provider at BasicAttachmentProvider.js:420-428 backs up the metadata Map which tracks all attachments. The actual files remain in ./data/attachments/ directory and are referenced by their SHA-256 hash.
Need to modify backup() and restore() functions in BasicAttachmentProvider.js so AttachmentManager can make appropriate calls.

### PageManager (Delegates to Provider)

PageManager itself has no custom backup method at PageManager.js:17-170, so it uses the default BaseManager implementation:
{
  managerName: 'PageManager',
  timestamp: '2025-10-10T...',
  data: null
}

However: The provider (FileSystemProvider)  __needs to implement backup/restore__. Currently it doesn't have these methods implemented, which means:

- Page data stays in the filesystem (./pages/ directory)
- Metadata/frontmatter is in the markdown files
- Provider would need to return page cache/index data if implemented

Potential future implementation:

``` javascript
{
  managerName: 'PageManager',
  timestamp: '2025-10-10T...',
  providerClass: 'FileSystemProvider',
  providerBackup: {
    pages: [
      { uuid: '...', title: 'Main', filePath: 'pages/...' },
      // ... all page metadata
    ],
    pageCache: { /* title->uuid mappings */ }
  }
}
```

### UserManager (Not Yet Implemented)

Currently has no custom backup/restore at UserManager.js, but should return:

``` javascript
{
  managerName: 'UserManager',
  timestamp: '2025-10-10T...',
  users: [
    { username: 'admin', /* hashed password, roles, etc. */ }
  ],
  roles: [
    { name: 'admin', permissions: [...] }
  ],
  sessions: [
    { sessionId: '...', userId: '...', expires: '...' }
  ]
}
```

Storage Model: UserManager stores data in JSON files:
./users/users.json - User accounts
./users/roles.json - Role definitions
./users/sessions.json - Active sessions

## 🎯 Key Architectural Patterns

### Pattern 1: Metadata-Only Backups

Most managers backup references and metadata, not actual content:
AttachmentManager → Backs up metadata, files stay in ./data/attachments/
PageManager → Would backup index/cache, files stay in ./pages/
UserManager → Would backup user records, not raw JSON files

### Pattern 2: Provider Delegation

Managers that use providers delegate backup/restore:
// Manager level
async backup() {
  const providerBackup = await this.provider.backup();
  return {
    managerName: this.constructor.name,
    providerClass: this.providerClass,
    providerBackup: providerBackup
  };
}

This allows swapping storage backends without changing backup logic.

### Pattern 3: Graceful Degradation

If a manager has no data, it returns data: null
If backup fails, it's logged but doesn't stop other managers
Non-data managers don't need special handling

## 📦 Backup Output: File vs Folder

Current Implementation: Single .gz File

The BackupManager creates a single compressed file at BackupManager.js:77-157:
./backups/
  ├── ngdpbase-backup-2025-10-10T12-00-00-000Z.json.gz
  ├── ngdpbase-backup-2025-10-09T12-00-00-000Z.json.gz
  └── ...

### Contents

JSON structure with all manager backups
Compressed with gzip (~30-50% of original size)
Metadata only, not actual file contents
Actual Data Storage (Separate from Backup)
The real data stays in the filesystem:

./
├── pages/                    # Wiki page markdown files
│   ├── uuid1.md
│   └── uuid2.md
├── data/
│   └── attachments/          # Attachment files + metadata
│       ├── BasicAttachmentProvider.json
│       ├── hash1.jpg
│       └── hash2.pdf
├── users/                    # User data
│   ├── users.json
│   ├── roles.json
│   └── sessions.json
└── backups/                  # Backup files
    └── ngdpbase-backup-*.json.gz

## Summary Table

| Manager | Has Data? | What's Backed Up | Where's Real Data
| ---- | ---- | ---- | ----
| AttachmentManager | ✅ Yes | Metadata Map | ./data/attachments/
| PageManager | ✅ Yes | (Not implemented) | ./pages/
| UserManager | ✅ Yes | (Not implemented) | ./users/
| SearchManager | ✅ Probably | (Not implemented) | In-memory indexes?
| PolicyManager | ❌ No | data: null | Config file
| VariableManager | ❌ No | data: null | Runtime only
| RenderingManager | ❌ No | data: null | Runtime cache
| ValidationManager | ❌ No | data: null | Runtime only

## 💡 Recommendations

1. Implement backup for PageManager/Provider - Critical data not currently backed up
2. Implement backup for UserManager - User accounts should be in backups
3. MUST ADD full backup option - Include actual files, not just metadata
4. Document what's NOT backed up - Make it clear to users
5. Add restore verification - Validate restored data integrity

The current design is elegant for metadata backups but may need a companion system for full backups including actual file contents.
