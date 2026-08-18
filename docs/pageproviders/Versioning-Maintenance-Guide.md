# Versioning Maintenance Guide

Complete guide to maintaining and optimizing VersioningFileProvider storage in ngdpbase.

## Table of Contents

- [Overview](#overview)
- [Performance Optimizations](#performance-optimizations)
  - [Checkpointing](#checkpointing)
  - [Version Caching](#version-caching)
- [Version Cleanup](#version-cleanup)
  - [Automatic Cleanup](#automatic-cleanup)
  - [Manual Cleanup](#manual-cleanup)
  - [Dry Run Mode](#dry-run-mode)
- [Storage Analytics](#storage-analytics)
  - [Storage Reports](#storage-reports)
  - [Page Storage Details](#page-storage-details)
- [Compression](#compression)
- [CLI Maintenance Tool](#cli-maintenance-tool)
- [Best Practices](#best-practices)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

VersioningFileProvider stores complete version history for every page, allowing users to view, compare, and restore previous versions. Over time, this can accumulate significant storage. This guide covers the maintenance tools and optimizations available to manage version storage efficiently.

### Key Features

- __Automatic checkpointing__: Full content snapshots every N versions for fast retrieval
- __LRU caching__: Recently accessed versions cached in memory
- __Intelligent cleanup__: Purge old versions while preserving important milestones
- __Compression__: Gzip compression for older versions
- __Storage analytics__: Detailed reports and optimization recommendations
- __CLI tool__: Interactive maintenance operations with progress tracking

---

## Performance Optimizations

### Checkpointing

By default, VersioningFileProvider stores full content only for v1, then uses diffs (deltas) for subsequent versions. This saves storage but makes reconstruction slower for high version numbers.

__Checkpointing__ stores full content snapshots at regular intervals (default: every 10 versions).

#### How It Works

```text
v1  → Full content (checkpoint)
v2  → Diff from v1
v3  → Diff from v2
...
v10 → Full content (checkpoint)
v11 → Diff from v10
...
v20 → Full content (checkpoint)
```

When retrieving v18, the system:

1. Loads v10 (nearest checkpoint)
2. Applies diffs v11-v18 (8 operations instead of 17)

#### Configuration

```json
{
  "ngdpbase.page.provider.versioning.checkpointinterval": 10
}
```

__Recommendations:__

- High-traffic wikis: `5` (faster retrieval, more storage)
- Large pages: `5-10` (reduce reconstruction time)
- Storage-constrained: `20` (slower retrieval, less storage)
- Default: `10` (balanced)

#### Benefits

- __50-80% faster__ version retrieval for high version numbers
- Minimal storage overhead (~10% increase)
- Automatic creation during page saves

### Version Caching

Recently accessed versions are cached in memory using an LRU (Least Recently Used) cache.

#### Configuration

```json
{
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

__Cache size recommendations:__

- Small wiki (<100 pages): `20-30`
- Medium wiki (100-1000 pages): `50-100`
- Large wiki (>1000 pages): `100-200`
- High-memory servers: `200-500`

#### Benefits

- __95%+ faster__ repeated access to same versions
- Zero file I/O for cached versions
- Automatic LRU eviction prevents memory bloat

#### Memory Usage

Approximate memory per cached version:

- Small page (5KB): ~10KB with metadata
- Medium page (20KB): ~25KB with metadata
- Large page (100KB): ~110KB with metadata

__Example:__ 50 entries × 20KB average = ~1MB memory

---

## Version Cleanup

### Automatic Cleanup

Configure automatic cleanup thresholds in `app-custom-config.json`:

```json
{
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365
}
```

These settings apply when pages are saved. Versions exceeding limits are automatically purged.

### Manual Cleanup

For batch cleanup across all pages, use the CLI tool or programmatic API.

#### CLI Usage

```bash
# Preview cleanup (dry run)
npm run maintain:cleanup -- --dry-run

# Cleanup with custom retention
npm run maintain:cleanup -- --keep-latest 50 --retention 180

# Verbose output
npm run maintain:cleanup -- --verbose
```

#### Programmatic API

```javascript
const provider = engine.getManager('PageManager').provider;

// Cleanup a specific page
const report = await provider.purgeOldVersions('PageTitle', {
  keepLatest: 20,          // Keep at least 20 most recent versions
  retentionDays: 90,       // Keep versions newer than 90 days
  keepMilestones: true,    // Preserve v1, v10, v20, etc.
  dryRun: false            // Set true to preview
});

console.log(`Removed ${report.versionsRemoved} versions`);
console.log(`Freed ${report.spaceFreedMB} MB`);
```

#### Batch Cleanup

```javascript
const VersioningMaintenance = require('./src/utils/VersioningMaintenance');

const maintenance = new VersioningMaintenance({
  provider,
  dryRun: false,
  verbose: true,
  progressCallback: (progress) => {
    console.log(`Processing ${progress.current}/${progress.total}: ${progress.itemName}`);
  }
});

const report = await maintenance.cleanupAllPages({
  keepLatest: 30,
  retentionDays: 180,
  keepMilestones: true
});

console.log(`
  Pages processed: ${report.pagesProcessed}
  Versions removed: ${report.versionsRemoved}
  Space freed: ${report.spaceFreedMB} MB
  Duration: ${report.durationSeconds}s
`);
```

### Cleanup Options Explained

#### `keepLatest`

Minimum number of versions to keep, regardless of age.

__Example:__ `keepLatest: 20`

- Page with 50 versions: Keep v31-v50 (20 versions)
- Page with 10 versions: Keep all (below threshold)

#### `retentionDays`

Keep all versions newer than this many days.

__Example:__ `retentionDays: 90`

- Versions created in last 90 days are preserved
- Older versions may be purged (subject to `keepLatest`)

#### `keepMilestones`

Preserve milestone versions (v1 and every 10th version).

__Example:__ Page with 45 versions, `keepLatest: 20`, `keepMilestones: true`

- Without milestones: Purge v1-v25 (25 versions)
- With milestones: Purge v2-v9, v11-v19, v21-v25 (23 versions)
- Preserved: v1, v10, v20, v26-v45

__Why preserve milestones?__

- Historical snapshots at regular intervals
- Fast access to older versions (checkpoints)
- Better diff performance

### Dry Run Mode

Always test cleanup with dry run first:

```javascript
const report = await provider.purgeOldVersions('PageTitle', {
  keepLatest: 10,
  dryRun: true  // Preview only
});

console.log(`Would remove ${report.versionsRemoved} versions`);
console.log(`Would free ${report.spaceFreedMB} MB`);
// No changes made to disk
```

---

## Storage Analytics

### Storage Reports

Generate comprehensive storage analytics:

```bash
# CLI
npm run maintain:analyze

# Saves report to data/maintenance-reports/storage-report-<timestamp>.json
```

#### Programmatic API

```javascript
const VersioningAnalytics = require('./src/utils/VersioningAnalytics');

const analytics = new VersioningAnalytics({
  provider,
  verbose: true
});

const report = await analytics.generateStorageReport();
```

#### Report Structure

```javascript
{
  timestamp: "2024-10-14T12:00:00.000Z",

  summary: {
    totalPages: 150,
    pagesWithVersions: 142,
    totalVersions: 3420,
    averageVersionsPerPage: "24.08",
    totalStorageMB: "245.67"
  },

  byLocation: {
    pages: {
      count: 140,
      storage: 240000000,
      versions: 3380
    },
    "required-pages": {
      count: 2,
      storage: 5670000,
      versions: 40
    }
  },

  topPages: [
    {
      title: "Main",
      uuid: "abc123",
      versionCount: 120,
      storageMB: "15.45",
      compressed: 80,
      averageVersionSize: "135000"
    },
    // ... top 20 pages by storage
  ],

  versionDistribution: {
    "1": 8,          // 8 pages with 1 version
    "2-5": 25,       // 25 pages with 2-5 versions
    "6-10": 40,
    "11-20": 45,
    "21-50": 20,
    "50+": 4
  },

  compressionStats: {
    compressedVersions: 2100,
    uncompressedVersions: 1320,
    spacesSaved: 0,
    potentialSavings: 0
  },

  recommendations: [
    {
      type: "cleanup",
      priority: "high",
      message: "4 pages have more than 50 versions",
      action: "Run cleanup to purge old versions",
      command: "npm run maintain:cleanup -- --keep-latest 50"
    },
    {
      type: "compression",
      priority: "medium",
      message: "38% of versions are uncompressed",
      action: "Run compression to reduce storage usage",
      command: "npm run maintain:compress",
      estimatedSavings: "~90 MB"
    }
    // ... more recommendations
  ]
}
```

### Page Storage Details

Get detailed storage breakdown for a specific page:

```javascript
const details = await analytics.getPageStorageDetails('PageTitle');

console.log(`
  Page: ${details.page.title}
  Total versions: ${details.summary.versionCount}
  Total storage: ${details.summary.totalSizeMB} MB
  Average version size: ${details.summary.averageVersionSize} KB
  Compressed: ${details.summary.compressedVersions}
  Uncompressed: ${details.summary.uncompressedVersions}
`);

// Per-version details
details.versions.forEach(v => {
  console.log(`v${v.version}: ${v.sizeKB} KB, ${v.compressed ? 'compressed' : 'uncompressed'}, ${v.isDelta ? 'delta' : 'full'}`);
});

// Storage by type
console.log(`
  Full content: ${details.storageByType.fullContent} bytes
  Deltas: ${details.storageByType.deltas} bytes
  Metadata: ${details.storageByType.metadata} bytes
`);
```

---

## Compression

Compress older versions to reduce storage (uses gzip):

```bash
# CLI
npm run maintain:compress -- --age 30  # Compress versions older than 30 days

# Dry run
npm run maintain:compress -- --age 60 --dry-run
```

### Programmatic API

```javascript
const maintenance = new VersioningMaintenance({ provider });

const report = await maintenance.compressAllVersions({
  ageThresholdDays: 30,        // Compress versions older than 30 days
  compressionLevel: 6,         // 1-9, default 6 (balanced)
  skipAlreadyCompressed: true  // Don't re-compress
});

console.log(`
  Versions compressed: ${report.versionsCompressed}
  Space freed: ${report.spaceFreedMB} MB
`);
```

### Compression Levels

- __1-3__: Fast compression, lower ratio (~40% savings)
- __4-6__: Balanced (default 6) (~55% savings)
- __7-9__: Best compression, slower (~60% savings)

__Recommendation:__ Use level 6 for most cases. Use 9 for archival storage.

---

## CLI Maintenance Tool

Interactive maintenance tool with progress tracking and colored output.

### Commands

```bash
# Show help
npm run maintain:versioning -- --help

# Cleanup old versions
npm run maintain:cleanup

# Compress old versions
npm run maintain:compress

# Generate analytics report
npm run maintain:analyze

# Run full maintenance (cleanup + compression)
npm run maintain:full
```

### Options

```bash
--dry-run              Preview actions without making changes
--verbose              Enable verbose logging
--keep-latest <n>      Minimum versions to keep (default: 20)
--retention <days>     Keep versions newer than days (default: 90)
--age <days>           Compress versions older than days (default: 30)
```

### Examples

```bash
# Preview cleanup with custom retention
npm run maintain:cleanup -- --dry-run --keep-latest 50 --retention 180

# Compress versions older than 60 days
npm run maintain:compress -- --age 60 --verbose

# Full maintenance with verbose output
npm run maintain:full -- --verbose

# Analyze storage and generate report
npm run maintain:analyze
```

### Output Example

```text
═══════════════════════════════════════════════════════════════════
  ngdpbase Version Maintenance Tool
═══════════════════════════════════════════════════════════════════

ℹ Loading VersioningFileProvider...
✓ Provider loaded successfully

ℹ Running version cleanup
ℹ Found 142 pages with versions
ℹ Keep latest: 20 versions
ℹ Retention: 90 days

  Progress: [████████████████████████████████████████] 100% (142/142) - Main

✓ Cleanup completed successfully!

Cleanup Results:
──────────────────────────────────────────────────────────────────
  Duration:          12.5s
  Pages processed:   142
  Versions removed:  856
  Space freed:       127.3 MB
──────────────────────────────────────────────────────────────────

✓ Maintenance complete!
```

---

## Best Practices

### Regular Maintenance Schedule

Run maintenance operations on a schedule:

```bash
# Cron job example (weekly cleanup and compression)
0 2 * * 0 cd /path/to/ngdpbase && npm run maintain:full

# Monthly analytics report
0 3 1 * * cd /path/to/ngdpbase && npm run maintain:analyze
```

### Before Major Operations

1. __Backup data__ before first-time cleanup
2. __Run analytics__ to understand current state
3. __Test with dry-run__ to verify expected results
4. __Start with conservative settings__ (higher keepLatest, retentionDays)
5. __Monitor disk space__ after maintenance

### Recommended Settings by Wiki Size

#### Small Wiki (<100 pages, <1000 versions)

```json
{
  "maxversions": 50,
  "retentiondays": 365,
  "checkpointinterval": 10,
  "cachesize": 30
}
```

__Maintenance:__ Quarterly cleanup, semi-annual compression

#### Medium Wiki (100-1000 pages, 1000-10000 versions)

```json
{
  "maxversions": 30,
  "retentiondays": 180,
  "checkpointinterval": 10,
  "cachesize": 100
}
```

__Maintenance:__ Monthly cleanup, quarterly compression

#### Large Wiki (>1000 pages, >10000 versions)

```json
{
  "maxversions": 20,
  "retentiondays": 90,
  "checkpointinterval": 5,
  "cachesize": 200
}
```

__Maintenance:__ Weekly cleanup, monthly compression

### Storage Optimization Strategy

1. __Run analytics first__

   ```bash
   npm run maintain:analyze
   ```

2. __Review recommendations__ in the report

3. __Cleanup old versions__

   ```bash
   npm run maintain:cleanup -- --keep-latest 30 --retention 90
   ```

4. __Compress old versions__

   ```bash
   npm run maintain:compress -- --age 60
   ```

5. __Monitor results__ with another analytics run

6. __Adjust settings__ based on results

### High-Activity Pages

Pages with frequent edits benefit from:

- Lower checkpoint interval (5 instead of 10)
- Higher cache priority (manually accessed more often)
- More aggressive cleanup (lower keepLatest)

Consider creating page-specific retention policies in future versions.

---

## Configuration Reference

### All Versioning Settings

```json
{
  "ngdpbase.page.provider": "VersioningFileProvider",

  "ngdpbase.page.provider.versioning.indexfile": "./data/page-index.json",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10,
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

### Configuration Details

| Setting | Type | Default | Description |
| --------- | ------ | --------- | ------------- |
| `indexfile` | string | `./data/page-index.json` | Path to page index file |
| `maxversions` | number | `50` | Maximum versions per page (auto-cleanup) |
| `retentiondays` | number | `365` | Retention period in days (auto-cleanup) |
| `compression` | string | `gzip` | Compression algorithm (gzip or none) |
| `deltastorage` | boolean | `true` | Enable delta storage (diffs) |
| `checkpointinterval` | number | `10` | Create checkpoint every N versions |
| `cachesize` | number | `50` | Number of versions to cache in memory |

---

## Troubleshooting

### Issue: Versions Removed But Space Not Freed

__Cause:__ Operating system may not immediately reflect freed space.

__Solution:__

```bash
# Force filesystem sync (Linux/Mac)
sync

# Check actual disk usage
du -sh data/pages/versions
```

### Issue: High Memory Usage

__Cause:__ Version cache too large or cached versions are large pages.

__Solution:__

1. Reduce cache size:

   ```json
   {"ngdpbase.page.provider.versioning.cachesize": 20}
   ```

2. Restart application to clear cache

3. Monitor with:

   ```javascript
   console.log(`Cache entries: ${provider.versionCache.size}`);
   ```

### Issue: Slow Version Retrieval

__Causes:__

- Checkpoint interval too high
- Cache size too small
- Large number of versions between checkpoints

__Solutions:__

1. Reduce checkpoint interval:

   ```json
   {"ngdpbase.page.provider.versioning.checkpointinterval": 5}
   ```

2. Increase cache size:

   ```json
   {"ngdpbase.page.provider.versioning.cachesize": 100}
   ```

3. Run cleanup to reduce version count

### Issue: Cleanup Removes Fewer Versions Than Expected

__Cause:__ Milestone preservation or retention policy keeps more versions.

__Solution:__

```javascript
// Disable milestones for more aggressive cleanup
await provider.purgeOldVersions('PageTitle', {
  keepLatest: 10,
  keepMilestones: false  // Disable milestone preservation
});
```

### Issue: Cannot Find Version After Cleanup

__Cause:__ Version was purged during cleanup.

__Solution:__

- Check cleanup report for list of purged versions
- Verify version existed before cleanup
- Restore from backup if critical

__Prevention:__

- Always use dry-run first
- Review purge list before confirming
- Maintain backups of critical pages

### Issue: Manifest Corruption

__Symptom:__ Error: "Version X metadata not found in manifest"

__Cause:__ Manifest file corrupted or out of sync.

__Solution:__

```javascript
// Rebuild manifest (future feature)
await provider.rebuildManifest('page-uuid');

// For now, restore from backup
```

---

## Related Documentation

- [Versioning Implementation Plan](./planning/Versioning-Implementation.md)
- [Migration Guide](./migration/Migrate-to-Versioning-Guide.md)
- [API Documentation](./api/)
- [Backups Guide](./Backups.md)

---

## Support

For issues or questions:

- GitHub Issues: [ngdpbase Issues](https://github.com/your-repo/ngdpbase/issues)
- Documentation: [docs/README.md](./README.md)

---

__Last Updated:__ 2024-10-14
__Version:__ 1.3.2
