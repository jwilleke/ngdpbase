---
name: VersioningFileProvider
description: File-based page storage with delta-compressed version history; the default PageManager backend
dateModified: '2026-05-14'
category: providers
code: src/providers/VersioningFileProvider.ts
---

# VersioningFileProvider

**Quick Reference** | [Complete Guide](VersioningFileProvider-Complete-Guide.md)

**Module:** `src/providers/VersioningFileProvider.ts`
**Type:** Page Storage Provider with Versioning
**Extends:** FileSystemProvider
**Status:** Production Ready

## Overview

VersioningFileProvider extends FileSystemProvider with full version history tracking. It stores page versions using delta compression, enabling unlimited undo/redo and complete page history.

## Key Features

- **Full version history** - Every save creates a new version
- **Delta compression** - 80-95% space savings vs full snapshots
- **Fast-diff algorithm** - Efficient diff computation
- **Pako compression** - Gzip compression for delta storage
- **Metadata tracking** - Author, timestamp, change summary per version
- **Unlimited undo/redo** - Restore any previous version
- **All FileSystemProvider features** - UUID naming, title lookup, plural matching, caching

## Configuration

```javascript
// All FileSystemProvider config, plus:
'ngdpbase.page.provider.versioning.enabled'        // Enable versioning (default: true)
'ngdpbase.page.provider.versioning.storagedir'     // Versions directory (default: ./data/versions)
'ngdpbase.page.provider.versioning.metadatafile'   // Metadata file (default: versions-metadata.json)
'ngdpbase.page.provider.versioning.maxversions'    // Max versions per page (default: 100)
'ngdpbase.page.provider.versioning.compression'    // Enable compression (default: true)
```

## Basic Usage

```javascript
// VersioningFileProvider is configured via PageManager
const pageManager = engine.getManager('PageManager');
const provider = pageManager.getCurrentPageProvider();

// All FileSystemProvider methods, plus version methods
await pageManager.savePage('MyPage', {...});     // Creates new version automatically
const versions = await pageManager.getVersionHistory('MyPage');
const v5 = await pageManager.getPageVersion('MyPage', 5);
await pageManager.restoreVersion('MyPage', 5);
```

## Storage Structure

```
data/pages/
  └── 550e8400-e29b-41d4-a716-446655440000.md  (Current version)

data/versions/
  ├── 550e8400-e29b-41d4-a716-446655440000/
  │   ├── v1.delta.gz    (Compressed delta from v0 → v1)
  │   ├── v2.delta.gz    (Compressed delta from v1 → v2)
  │   └── v3.delta.gz    (Compressed delta from v2 → v3)
  └── versions-metadata.json
```

## Version Metadata Format

```json
{
  "550e8400-e29b-41d4-a716-446655440000": {
    "pageTitle": "Home",
    "versions": [
      {
        "version": 1,
        "author": "admin",
        "timestamp": "2025-01-15T10:00:00.000Z",
        "summary": "Initial version",
        "size": 1024,
        "deltaSize": 512
      },
      {
        "version": 2,
        "author": "editor",
        "timestamp": "2025-01-15T14:30:00.000Z",
        "summary": "Added introduction section",
        "size": 1536,
        "deltaSize": 256
      }
    ]
  }
}
```

## Core Methods

### Version History

| Method | Purpose | Example |
| -------- | --------- | --------- |
| `getVersionHistory(identifier)` | Get all versions for page | `await provider.getVersionHistory('Home')` |
| `getPageVersion(identifier, version)` | Get specific version | `await provider.getPageVersion('Home', 5)` |
| `getLatestVersion(identifier)` | Get current version number | `const v = await provider.getLatestVersion('Home')` |
| `restoreVersion(identifier, version)` | Restore old version | `await provider.restoreVersion('Home', 3)` |
| `deleteVersion(identifier, version)` | Delete specific version | `await provider.deleteVersion('Home', 2)` |
| `pruneVersions(identifier, keepCount)` | Limit version count | `await provider.pruneVersions('Home', 50)` |

### All FileSystemProvider Methods

All methods from FileSystemProvider are available:

- `getPage()`, `getAllPages()`, `savePage()`, `deletePage()`, `renamePage()`, etc.

## Delta Storage

VersioningFileProvider uses fast-diff + pako compression:

```javascript
// Version 1 content
const v1 = "Hello World";

// Version 2 content
const v2 = "Hello Beautiful World";

// Stored delta (compressed):
[
  { count: 6, value: "Hello " },      // Unchanged
  { count: 10, added: true, value: "Beautiful " },  // Added
  { count: 5, value: "World" }        // Unchanged
]
// Delta size: ~80 bytes (vs 512 bytes for full v2)
```

## Space Savings

- **Full snapshots:** 100 versions × 10KB = 1MB per page
- **Delta compression:** 100 versions × 200 bytes = 20KB per page
- **Savings:** 98% reduction in storage

## Version Operations

### Get Version History

```javascript
const versions = await provider.getVersionHistory('MyPage');
console.log(versions);
/*
[
  { version: 1, author: 'admin', timestamp: '...', summary: 'Initial' },
  { version: 2, author: 'editor', timestamp: '...', summary: 'Updated intro' },
  { version: 3, author: 'admin', timestamp: '...', summary: 'Fixed typo' }
]
*/
```

### Get Specific Version

```javascript
const v2 = await provider.getPageVersion('MyPage', 2);
console.log(v2.content);  // Full content reconstructed from deltas
console.log(v2.metadata); // Version metadata (author, timestamp)
```

### Restore Version

```javascript
// Restore version 3 (creates new version 4 with v3 content)
await provider.restoreVersion('MyPage', 3);

const history = await provider.getVersionHistory('MyPage');
/*
[
  { version: 1, ... },
  { version: 2, ... },
  { version: 3, summary: 'Fixed typo' },
  { version: 4, summary: 'Restored from version 3' }  ← New version
]
*/
```

### Prune Old Versions

```javascript
// Keep only last 50 versions
await provider.pruneVersions('MyPage', 50);

// Deletes oldest versions beyond limit
```

## Version Reconstruction

VersioningFileProvider reconstructs content by applying deltas sequentially:

```javascript
// To get version 5:
1. Read current page (version 10)
2. Read metadata to find delta chain
3. Apply deltas in reverse: v10 → v9 → v8 → v7 → v6 → v5
4. Return reconstructed v5 content
```

## Performance Considerations

- **Write performance** - Creates delta on every save (~10ms overhead)
- **Read performance** - Current version is instant (no delta application)
- **Version retrieval** - O(n) where n = versions to reverse (fast for recent versions)
- **Storage** - 80-95% space savings vs full snapshots

## Error Handling

```javascript
try {
  const v999 = await provider.getPageVersion('MyPage', 999);
} catch (err) {
  // Version not found
  console.error('Version 999 does not exist');
}

// Check version count first
const history = await provider.getVersionHistory('MyPage');
const latestVersion = history[history.length - 1].version;
```

## Backup and Restore

```javascript
// Backup includes all versions
const backup = await provider.backup();
/*
{
  pages: [...],              // Current page content
  versions: [...],           // All version deltas
  metadata: {...}            // Version metadata
}
*/

// Restore preserves version history
await provider.restore(backup);
```

## Dependencies

- All FileSystemProvider dependencies, plus:
- `fast-diff` - Efficient diff algorithm (Google's diff-match-patch port)
- `pako` - Gzip compression for deltas

## Migration from FileSystemProvider

VersioningFileProvider is a drop-in replacement:

```javascript
// Before (in config)
'ngdpbase.page.provider': 'filesystemprovider'

// After (enable versioning)
'ngdpbase.page.provider': 'versioningfileprovider'
'ngdpbase.page.provider.versioning.enabled': true
```

All existing pages work immediately. Versions are created starting from first edit.

## Related Documentation

- **Complete Guide:** [VersioningFileProvider-Complete-Guide.md](VersioningFileProvider-Complete-Guide.md)
- **Parent Class:** [FileSystemProvider.md](FileSystemProvider.md)
- **Manager:** [PageManager.md](../managers/PageManager.md)
- **Migration Guide:** [Versioning-Migration-Guide.md](../pageproviders/Versioning-Migration-Guide.md)
- **Maintenance:** [Versioning-Maintenance-Guide.md](../pageproviders/Versioning-Maintenance-Guide.md)

## Common Issues

**Q: Too many versions consuming space?**
A: Use `pruneVersions()` to limit version count per page

**Q: Version retrieval slow?**
A: Older versions require more delta application - consider keeping fewer versions

**Q: Version metadata file growing large?**
A: Prune old versions or archive to separate file

**Q: Delta reconstruction failing?**
A: Verify delta files not corrupted, check compression enabled

---

**Last Updated:** 2025-12-22
**Version:** 1.5.0
