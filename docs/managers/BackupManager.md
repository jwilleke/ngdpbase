---
name: BackupManager
description: "System-wide backup and restore — pages, attachments, config, search indices"
dateModified: '2026-05-14'
category: managers
code: src/managers/BackupManager.ts
---

# BackupManager

**Module:** `src/managers/BackupManager.ts`
**Extends:** [BaseManager](BaseManager.md)
**Complete Guide:** [BackupManager-Complete-Guide.md](BackupManager-Complete-Guide.md)

---

## Overview

BackupManager coordinates backup and restore operations across all registered managers in ngdpbase. It provides centralized system-wide backups with compression, retention policies, and automatic cleanup.

## Key Features

- **Auto-Discovery** - Automatically backs up all registered managers
- **Compression** - Gzip compression for efficient storage
- **Retention Policy** - Configurable maximum backup count
- **Atomic Backups** - Full-system backups in single operation
- **Restore Coordination** - Coordinated restore across all managers
- **Error Resilience** - One manager failure doesn't stop backup
- **Statistics Tracking** - Backup sizes, compression ratios, timing

## Quick Example

```javascript
const backupManager = engine.getManager('BackupManager');

// Create full system backup
const backupPath = await backupManager.backup();
console.log('Backup created:', backupPath);
// Output: /path/to/backups/backup-2025-12-21-120530.gz

// List available backups
const backups = await backupManager.listBackups();
console.log('Available backups:', backups);

// Restore from latest backup
const latest = await backupManager.getLatestBackup();
await backupManager.restore(latest.path);

// Cleanup old backups (keeps maxBackups)
await backupManager.cleanupOldBackups();
```

## Core Methods

| Method | Returns | Description |
| -------- | --------- | ------------- |
| `backup(options)` | `Promise<string>` | Create full system backup, returns path |
| `restore(backupPath, options)` | `Promise<void>` | Restore from backup file |
| `listBackups()` | `Promise<Array>` | List all available backups with metadata |
| `getLatestBackup()` | `Promise<Object>` | Get latest backup information |
| `cleanupOldBackups()` | `Promise<number>` | Remove old backups, return count deleted |

## Backup Options

```javascript
await backupManager.backup({
  filename: 'custom-backup.gz',  // Custom filename (optional)
  compress: true                  // Enable compression (default: true)
});
```

## Restore Options

```javascript
await backupManager.restore(backupPath, {
  skipValidation: false,          // Skip JSON validation (default: false)
  overwrite: true,                // Overwrite existing data (default: true)
  managers: ['PageManager']       // Restore only specific managers (optional)
});
```

## Backup Object Structure

```javascript
{
  path: string,           // Full path to backup file
  filename: string,       // Backup filename
  size: number,           // File size in bytes
  created: Date,          // Creation timestamp
  compressed: boolean,    // Whether file is compressed
  managers: string[]      // List of backed up managers
}
```

## Configuration

```json
{
  "ngdpbase.backup.directory": "./data/backups",
  "ngdpbase.backup.max-backups": 10,
  "ngdpbase.backup.compression": true,
  "ngdpbase.backup.retention.days": 30
}
```

## Backup Coverage

Automatically backs up all registered managers that implement `backup()`:

| Manager | Coverage | Notes |
| --------- | ---------- | ------- |
| PageManager | ✅ Full | All pages via provider |
| UserManager | ✅ Full | All users via provider |
| ConfigurationManager | ✅ Full | Custom configuration |
| CacheManager | ✅ Partial | Cache metadata only |
| NotificationManager | ✅ Full | All notifications |
| SearchManager | ⚠️ Excluded | Index can be rebuilt |

## How It Works

1. **Auto-Discovery**: Calls `engine.getRegisteredManagers()` to get all managers
2. **Backup Loop**: Calls `manager.backup()` on each manager
3. **Aggregation**: Collects all backup data into single object
4. **Compression**: Serializes to JSON and compresses with gzip
5. **Storage**: Saves as timestamped `.gz` file
6. **Cleanup**: Removes old backups exceeding retention policy

## Backup File Format

```javascript
{
  metadata: {
    version: "1.5.0",
    timestamp: "2025-12-21T12:05:30.000Z",
    engine: "WikiEngine",
    managers: ["PageManager", "UserManager", ...]
  },
  data: {
    PageManager: { /* page data */ },
    UserManager: { /* user data */ },
    ConfigurationManager: { /* config */ }
  }
}
```

File is compressed with gzip and saved as `.gz`.

## CLI Usage

```bash
# Create backup
node scripts/backup-create.js

# List backups
node scripts/backup-list.js

# Restore from latest
node scripts/backup-restore.js --latest

# Restore from specific file
node scripts/backup-restore.js --file backup-2025-12-21-120530.gz

# Cleanup old backups
node scripts/backup-cleanup.js
```

## Best Practices

1. **Regular Backups**: Schedule daily backups via cron
2. **Off-site Storage**: Copy backups to remote location
3. **Test Restores**: Periodically test restore process
4. **Monitor Size**: Watch backup sizes for anomalies
5. **Retention Policy**: Set appropriate maxBackups value

## Error Handling

```javascript
try {
  const backupPath = await backupManager.backup();
  console.log('✅ Backup successful:', backupPath);
} catch (error) {
  console.error('❌ Backup failed:', error.message);
  // BackupManager continues even if individual managers fail
}
```

## Related Managers

- [ConfigurationManager](ConfigurationManager.md) - Backup settings
- [PageManager](PageManager.md) - Page data backup
- [UserManager](UserManager.md) - User data backup
- [NotificationManager](NotificationManager.md) - Notification backup

## Developer Documentation

For complete architecture, backup format details, provider integration, and troubleshooting:

- [BackupManager-Complete-Guide.md](BackupManager-Complete-Guide.md)
