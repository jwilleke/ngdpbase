# VersioningFileProvider Complete Guide

[Quick Reference](VersioningFileProvider.md) | __Complete Guide__

__Module:__ `src/providers/VersioningFileProvider.js`
__Type:__ Page Storage Provider with Versioning
__Extends:__ FileSystemProvider
__Status:__ Production Ready
__Version:__ 1.0.0
__Last Updated:__ 2025-12-22

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Initialization](#initialization)
- [Version Storage](#version-storage)
- [Version Retrieval](#version-retrieval)
- [Version History](#version-history)
- [Delta Compression](#delta-compression)
- [Page Index](#page-index)
- [Auto-Migration](#auto-migration)
- [Methods Reference](#methods-reference)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)

---

## Overview

VersioningFileProvider extends FileSystemProvider with full version history tracking using delta compression. It provides unlimited undo/redo capabilities while maintaining 80-95% space savings compared to storing full snapshots.

### Design Philosophy

- __Delta Storage__: Store differences between versions, not full copies
- __Compression__: Gzip compress deltas for maximum space efficiency
- __Backward Compatibility__: Drop-in replacement for FileSystemProvider
- __Auto-Migration__: Automatically adds versioning to existing pages
- __Reliability__: Centralized page index for fast lookups

### Key Features

__Version Management:__

- Full version history for every page
- Delta-compressed storage (v1 = full, v2+ = diffs)
- Gzip compression for deltas
- Unlimited undo/redo

__Storage Efficiency:__

- 80-95% space savings vs full snapshots
- Checkpoint intervals (full snapshots every N versions)
- Configurable max versions per page
- Automatic old version pruning

__Migration & Recovery:__

- Auto-migration from FileSystemProvider
- Centralized page index for fast lookups
- Index rebuilding from manifests
- Version manifest per page

__All FileSystemProvider Features:__

- UUID-based file naming
- Title-based lookup
- Plural matching
- Installation-aware loading
- In-memory caching

---

## Architecture

### Class Hierarchy

```
BasePageProvider (abstract)
  └── FileSystemProvider (concrete)
        └── VersioningFileProvider (adds versioning)
```

### Storage Structure

```
data/
  ├── page-index.json                    # Centralized page index
  ├── pages/
  │   ├── {uuid}.md                      # Current page version (public)
  │   ├── private/
  │   │   └── {author}/
  │   │         └── {uuid}.md            # Private page, routed by `private: true`
  │   └── versions/
  │         └── {uuid}/
  │               ├── manifest.json       # Version metadata
  │               ├── v1/
  │               │   └── content.md      # Full content (baseline)
  │               ├── v2/
  │               │   └── content.diff    # Delta from v1
  │               └── v3/
  │                     └── content.diff  # Delta from v2
  └── required-pages/
        ├── {uuid}.md
        └── versions/
              └── {uuid}/
                    └── (same structure)
```

### "Private" is a visibility model, not encryption

Routing a page with `private: true` to `pages/private/{author}/` is a __visibility / ACL convention__ enforced by ACLManager + the providers, not cryptographic privacy. Page bodies remain plaintext on disk, and several adjacent stores hold plaintext copies or denormalised metadata about private pages:

| Surface | Path | What leaks |
|---|---|---|
| __Version history__ | `pages/versions/{uuid}/` | Flat at the top level, NOT under `private/`. Every prior revision of a "private" page is stored next to public versions in the same directory tree. |
| __Page index__ | `page-index.json` | Denormalises `{uuid, title, slug, lastModified, author, location, creator}` for every page in the system, including private ones. |
| __Search index__ | `data/search-index/` (Lunr) or external Elasticsearch | Indexes the rendered content of private pages at save time. Anyone with index access reads private content. |
| __Attachments__ | `data/attachments/{uuid}.bin` | Flat by UUID — attachments to private pages share a directory with public ones. |
| __Backups / logs / audit__ | `data/backups/`, `data/logs/`, `data/audit/` | Anywhere page content is written outside `pages/private/{author}/` is a potential leak. |

The per-author directory layout makes `pages/private/{author}/` a natural unit for at-rest encryption — an `EncryptedFileSystemProvider` wrapping FSP/VFP would be one path. But "truly private" requires coordinated encryption across versions, search, attachments, backups, and audit, plus a key-management story (per-user keys derived from passphrase / external KMS / etc.). Out of scope for VFP today; tracked architecturally under EPIC #790 / #802 prerequisites. EPIC #790's #802 (canonicalising `private: true` as THE semantic flag) is a prerequisite — once every reader agrees on a single privacy signal, an encryption layer has a reliable input.

### Component Relationships

```
WikiEngine
  └── PageManager
        └── VersioningFileProvider
              ├── Extends: FileSystemProvider
              ├── Uses: DeltaStorage (diff computation)
              ├── Uses: VersionCompression (gzip)
              ├── Uses: fast-diff (diff algorithm)
              └── Uses: pako (compression library)
```

---

## Configuration

Inherits all FileSystemProvider configuration, plus:

### Versioning Configuration

```javascript
// Enable/disable versioning
'ngdpbase.page.provider.versioning.enabled'
  Default: true
  Type: Boolean
  Purpose: Enable version tracking

// Versions storage directory
'ngdpbase.page.provider.versioning.storagedir'
  Default: './data/versions'
  Type: String
  Purpose: Base directory for version storage

// Page index file
'ngdpbase.page.provider.versioning.pageindex'
  Default: './data/page-index.json'
  Type: String
  Purpose: Centralized page index location

// Maximum versions per page
'ngdpbase.page.provider.versioning.maxversions'
  Default: 100
  Type: Number
  Purpose: Limit version count (0 = unlimited)

// Enable delta compression
'ngdpbase.page.provider.versioning.compression'
  Default: true
  Type: Boolean
  Purpose: Gzip compress deltas

// Checkpoint interval
'ngdpbase.page.provider.versioning.checkpointinterval'
  Default: 10
  Type: Number
  Purpose: Store full snapshot every N versions (0 = disable)

// Retention days
'ngdpbase.page.provider.versioning.retentiondays'
  Default: 365
  Type: Number
  Purpose: Auto-delete versions older than N days (0 = keep all)
```

### Configuration Example

```json
{
  "ngdpbase": {
    "page": {
      "provider": {
        "filesystem": {
          "storagedir": "./data/pages",
          "requiredpagesdir": "./required-pages"
        },
        "versioning": {
          "enabled": true,
          "storagedir": "./data/versions",
          "pageindex": "./data/page-index.json",
          "maxversions": 100,
          "compression": true,
          "checkpointinterval": 10,
          "retentiondays": 365
        }
      }
    }
  }
}
```

---

## Initialization

### Initialization Sequence

1. __Call Parent Initialize__
   - FileSystemProvider initialization
   - Load pages, build caches

2. __Load Versioning Config__
   - Read all versioning settings
   - Set defaults

3. __Create Version Directories__
   - Ensure `./data/versions/` exists
   - Create subdirectories for pages and required-pages

4. __Load Page Index__
   - Read `page-index.json`
   - If missing, create empty index

5. __Auto-Migration (if needed)__
   - If index empty but pages exist
   - Create v1 for all existing pages
   - Build index from manifests

6. __Mark Initialized__
   - Log versioning status

### Page Index Structure

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-22T10:00:00.000Z",
  "pageCount": 42,
  "pages": {
    "550e8400-e29b-41d4-a716-446655440000": {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Home",
      "currentVersion": 5,
      "location": "pages",
      "lastModified": "2025-01-22T14:30:00.000Z",
      "editor": "admin",
      "hasVersions": true
    },
    "9f3a4b2c-5d1e-4a8f-b2c9-8e7f6d5c4a3b": {
      "uuid": "9f3a4b2c-5d1e-4a8f-b2c9-8e7f6d5c4a3b",
      "title": "Plugin Guide",
      "currentVersion": 12,
      "location": "pages",
      "lastModified": "2025-01-21T09:15:00.000Z",
      "editor": "editor",
      "hasVersions": true
    }
  }
}
```

---

## Version Storage

### Version Manifest

Each page has a manifest tracking all versions:

__Location:__ `./data/pages/versions/{uuid}/manifest.json`

__Structure:__

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Home",
  "currentVersion": 5,
  "location": "pages",
  "checkpointInterval": 10,
  "compressionEnabled": true,
  "lastModified": "2025-01-22T14:30:00.000Z",
  "editor": "admin",
  "versions": [
    {
      "version": 1,
      "dateCreated": "2025-01-15T10:00:00.000Z",
      "editor": "admin",
      "comment": "Initial version",
      "contentHash": "abc123...",
      "contentLength": 1024,
      "storageType": "full",
      "compressed": false
    },
    {
      "version": 2,
      "dateCreated": "2025-01-16T14:00:00.000Z",
      "editor": "editor",
      "comment": "Added introduction",
      "contentHash": "def456...",
      "contentLength": 1536,
      "deltaLength": 256,
      "storageType": "delta",
      "compressed": true,
      "compressionRatio": 0.62
    }
  ]
}
```

### Creating a Version

When `savePage()` is called, VersioningFileProvider:

1. __Read Previous Version__
   - Get current page content (v N)

2. __Compute Delta__
   - Use fast-diff to create diff from v N to v N+1
   - Result: array of operations (keep, insert, delete)

3. __Compress Delta__
   - Gzip compress delta using pako
   - Store compressed bytes

4. __Save Delta File__
   - Write to `v{N+1}/content.diff`

5. __Update Manifest__
   - Add version entry with metadata
   - Update currentVersion

6. __Update Page Index__
   - Update central index with new version number

7. __Update Current Page__
   - Write v N+1 content to `{uuid}.md`

### Checkpoint Snapshots

To speed up retrieval of old versions, full snapshots are stored periodically:

```javascript
// With checkpointInterval = 10:
v1:  full snapshot
v2:  delta from v1
v3:  delta from v2
...
v10: full snapshot (checkpoint)
v11: delta from v10
...
v20: full snapshot (checkpoint)
```

__Benefits:__

- Faster retrieval of old versions
- Limit delta chain length
- Recovery point if deltas corrupted

---

## Version Retrieval

### Getting a Specific Version

```javascript
const pageV3 = await provider.getPageVersion('Home', 3);
/*
{
  title: 'Home',
  uuid: '550e8400-...',
  content: '# Home\n\nWelcome!',  // Reconstructed from deltas
  metadata: {
    title: 'Home',
    version: 3,
    dateCreated: '2025-01-17T09:00:00.000Z',
    editor: 'admin',
    comment: 'Fixed typo'
  }
}
*/
```

### Reconstruction Algorithm

To retrieve version N:

1. __Find Nearest Checkpoint__
   - Look backwards from version N
   - Find most recent full snapshot or v1

2. __Load Baseline__
   - Read full content from checkpoint

3. __Apply Deltas__
   - Apply each delta sequentially
   - From checkpoint → version N

4. __Return Content__
   - Reconstructed content for version N

__Example:__

```
Request: v17
Checkpoints: v1 (full), v10 (full), v20 (full)

Reconstruction:
1. Load v10 (full snapshot)
2. Apply v11 delta (v10 → v11)
3. Apply v12 delta (v11 → v12)
4. Apply v13 delta (v12 → v13)
5. Apply v14 delta (v13 → v14)
6. Apply v15 delta (v14 → v15)
7. Apply v16 delta (v15 → v16)
8. Apply v17 delta (v16 → v17)
9. Return v17 content
```

---

## Version History

### Getting Version List

```javascript
const history = await provider.getVersionHistory('Home');
/*
[
  {
    version: 5,
    dateCreated: '2025-01-22T14:30:00.000Z',
    editor: 'admin',
    comment: 'Updated footer',
    contentLength: 2048,
    deltaLength: 128,
    compressed: true
  },
  {
    version: 4,
    dateCreated: '2025-01-20T11:00:00.000Z',
    editor: 'editor',
    comment: 'Added FAQ section',
    contentLength: 1920,
    deltaLength: 256,
    compressed: true
  },
  ...
]
*/
```

### Restoring Previous Version

Restoring creates a __new version__ with old content (non-destructive):

```javascript
// Current version: v5
await provider.restoreVersion('Home', 3, {
  editor: 'admin',
  comment: 'Reverted spam edit'
});
// New version: v6 (with content from v3)

const history = await provider.getVersionHistory('Home');
/*
[
  {
    version: 6,           // New version
    dateCreated: '2025-01-22T15:00:00.000Z',
    editor: 'admin',
    comment: 'Reverted spam edit (restored from v3)',
    ...
  },
  { version: 5, ... },  // Previous versions preserved
  { version: 4, ... },
  { version: 3, ... },  // Content source
  ...
]
*/
```

__Why non-destructive?__

- Preserves audit trail
- Can undo a restore (restore back to v5)
- No data loss

---

## Delta Compression

### fast-diff Algorithm

VersioningFileProvider uses Google's fast-diff algorithm (JavaScript port of diff-match-patch):

```javascript
// Version 1 content
const v1 = "Hello World";

// Version 2 content
const v2 = "Hello Beautiful World";

// Computed delta
const delta = fastDiff(v1, v2);
/*
[
  { count: 6, value: "Hello " },              // Unchanged
  { count: 10, added: true, value: "Beautiful " },  // Inserted
  { count: 5, value: "World" }                // Unchanged
]
*/
```

### Compression with pako

Deltas are gzipped for additional space savings:

```javascript
// Delta array (JSON)
const delta = [/* diff operations */];
const deltaJSON = JSON.stringify(delta);
// Size: ~800 bytes

// Compressed with pako
const compressed = pako.gzip(deltaJSON);
// Size: ~200 bytes (75% reduction)
```

### Space Savings Example

__Without versioning (full snapshots):__

```
v1: 10 KB (full)
v2: 11 KB (full)
v3: 11.5 KB (full)
...
v100: 12 KB (full)

Total: 100 × 11 KB (avg) = 1.1 MB
```

__With delta compression:__

```
v1: 10 KB (full)
v2: 200 bytes (delta)
v3: 150 bytes (delta)
...
v100: 180 bytes (delta)

Total: 10 KB + (99 × 200 bytes) = 30 KB
Savings: 97% reduction!
```

---

## Page Index

### Purpose

The page index provides O(1) lookups without scanning version directories:

__Without index:__

- Must scan all version directories
- O(n) lookup time
- Slow for large wikis

__With index:__

- Single JSON file with all page metadata
- O(1) lookup by UUID
- Fast even with thousands of pages

### Index Operations

#### Update on Save

```javascript
await provider.savePage('Home', { content: '...' });
// → Updates page index with new version number
```

#### Rebuild from Manifests

If index is lost or corrupted:

```javascript
await provider._rebuildPageIndexFromManifests();
// → Scans all version manifests
// → Rebuilds complete page index
```

---

## Auto-Migration

### Migrating from FileSystemProvider

VersioningFileProvider automatically detects existing pages without versions and creates v1:

__Migration Process:__

1. __Detect Pages Without Versions__
   - Check if page index is empty
   - Scan existing pages

2. __Create v1 for Each Page__
   - Read current page content
   - Create manifest.json
   - Store as v1/content.md

3. __Update Page Index__
   - Add entry for each migrated page

__Migration Example:__

```
Before Migration:
data/pages/
  └── 550e8400-....md  (no versions)

After Migration:
data/pages/
  ├── 550e8400-....md  (current version)
  └── versions/
        └── 550e8400-.../
              ├── manifest.json
              └── v1/
                    └── content.md
```

__Log Output:__

```
[VersioningFileProvider] Auto-migrating 42 existing pages...
[VersioningFileProvider] Migrated 10/42 pages...
[VersioningFileProvider] Migrated 20/42 pages...
[VersioningFileProvider] Migrated 30/42 pages...
[VersioningFileProvider] Migrated 40/42 pages...
[VersioningFileProvider] Auto-migration complete: 42 pages migrated, 0 errors
```

---

## Methods Reference

### Version Management Methods

#### `async getPageVersion(identifier, version)`

Get specific version of a page.

__Parameters:__

- `identifier` (String) - Page title, UUID, or slug
- `version` (Number) - Version number

__Returns:__ `Promise<Object>` - Page object with content from that version

__Example:__

```javascript
const v3 = await provider.getPageVersion('Home', 3);
console.log(v3.content);  // Content from version 3
```

---

#### `async getVersionHistory(identifier)`

Get all versions for a page.

__Parameters:__

- `identifier` (String) - Page title, UUID, or slug

__Returns:__ `Promise<Array>` - Array of version metadata (newest first)

__Example:__

```javascript
const history = await provider.getVersionHistory('Home');
console.log(history.length);  // Total versions
console.log(history[0].version);  // Latest version number
```

---

#### `async restoreVersion(identifier, version, options)`

Restore page to previous version (creates new version).

__Parameters:__

- `identifier` (String) - Page title, UUID, or slug
- `version` (Number) - Version to restore
- `options` (Object, optional):
  - `editor` (String) - Editor name
  - `comment` (String) - Restore comment

__Returns:__ `Promise<Number>` - New version number

__Example:__

```javascript
const newVersion = await provider.restoreVersion('Home', 3, {
  editor: 'admin',
  comment: 'Reverted spam edit'
});
console.log(`Restored to v3, created v${newVersion}`);
```

---

#### `async deleteVersion(identifier, version)`

Delete a specific version.

__Parameters:__

- `identifier` (String) - Page title, UUID, or slug
- `version` (Number) - Version to delete

__Returns:__ `Promise<Boolean>` - true if deleted

__Example:__

```javascript
await provider.deleteVersion('Home', 2);
```

__Note:__ Cannot delete current version or v1 (baseline).

---

#### `async pruneVersions(identifier, keepCount)`

Keep only the N most recent versions.

__Parameters:__

- `identifier` (String) - Page title, UUID, or slug
- `keepCount` (Number) - Number of versions to keep

__Returns:__ `Promise<Number>` - Number of versions deleted

__Example:__

```javascript
const deleted = await provider.pruneVersions('Home', 50);
console.log(`Deleted ${deleted} old versions`);
```

---

### Inherited Methods

All FileSystemProvider methods available:

- `getPage(identifier)`
- `getAllPages()`
- `savePage(identifier, pageData)`
- `deletePage(identifier)`
- `renamePage(oldIdentifier, newTitle)`
- `pageExists(identifier)`
- `refreshPageCache()`

---

## Performance

### Performance Characteristics

__Version Creation:__

- savePage(): ~15-25ms (includes delta computation)
- Delta computation: ~5ms for 10KB page
- Compression: ~3ms
- File I/O: ~10ms

__Version Retrieval:__

- Current version: ~5ms (no delta application)
- Recent version (< 10 versions back): ~10-20ms
- Old version (> 50 versions back): ~50-100ms
- With checkpoints: ~20-30ms (any version)

__History Operations:__

- getVersionHistory(): ~5ms (reads manifest only)
- restoreVersion(): Same as version retrieval + savePage()

__Storage:__

- Space savings: 80-95% vs full snapshots
- Compression ratio: 60-70% additional savings

### Optimization Strategies

1. __Use Checkpoints for Large Pages__

   ```javascript
   // Large documentation page with frequent edits
   'ngdpbase.page.provider.versioning.checkpointinterval': 5
   // Creates full snapshot every 5 versions
   ```

2. __Prune Old Versions__

   ```javascript
   // Keep only last 50 versions per page
   for (const page of pages) {
     await provider.pruneVersions(page.title, 50);
   }
   ```

3. __Limit Max Versions__

   ```javascript
   'ngdpbase.page.provider.versioning.maxversions': 100
   // Auto-prunes when exceeding limit
   ```

---

## Troubleshooting

### Version Reconstruction Failures

__Symptom:__ getPageVersion() returns corrupted content

__Causes:__

- Missing delta files
- Corrupted compression
- Manifest out of sync

__Solution:__

- Check delta files exist
- Verify compression integrity
- Use checkpoint if available
- Restore from backup

### Page Index Out of Sync

__Symptom:__ Pages not found or wrong versions

__Solution:__

```javascript
await provider._rebuildPageIndexFromManifests();
```

### Migration Failures

__Symptom:__ Auto-migration errors

__Checks:__

1. Verify page files exist
2. Check file permissions
3. Ensure sufficient disk space
4. Review migration logs

### Performance Issues

__Symptom:__ Slow version retrieval

__Solutions:__

1. Enable checkpoints
2. Prune old versions
3. Reduce retention days
4. Check disk I/O performance

---

## Related Documentation

- __Quick Reference:__ [VersioningFileProvider.md](VersioningFileProvider.md)
- __Parent Class:__ [FileSystemProvider.md](FileSystemProvider.md)
- __Manager:__ [PageManager.md](../managers/PageManager.md)
- __Migration Guide:__ [Versioning-Migration-Guide.md](../pageproviders/Versioning-Migration-Guide.md)
- __Maintenance:__ [Versioning-Maintenance-Guide.md](../pageproviders/Versioning-Maintenance-Guide.md)

---

__Last Updated:__ 2025-12-22
__Version:__ 1.0.0
