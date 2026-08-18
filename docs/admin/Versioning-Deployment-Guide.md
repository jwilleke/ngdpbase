# VersioningFileProvider Deployment Guide

Complete guide for administrators to deploy and configure page versioning in ngdpbase.

## Overview

This guide covers:

- Prerequisites and requirements
- Installation and configuration
- Migration from FileSystemProvider
- Testing and verification
- Performance tuning
- Troubleshooting
- Maintenance procedures

__Target Audience__: Wiki administrators and DevOps engineers

__Estimated Time__: 30-60 minutes for initial deployment

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Migration](#migration)
- [Testing](#testing)
- [Performance Tuning](#performance-tuning)
- [Monitoring](#monitoring)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### System Requirements

__Minimum__:

- Node.js 14.x or higher
- 1GB free disk space (for version storage)
- 512MB available RAM
- Read/write permissions on data directories

__Recommended__:

- Node.js 18.x or higher
- 5GB+ free disk space
- 2GB+ available RAM
- SSD storage for better performance

### Software Dependencies

All required dependencies are already included in ngdpbase 1.3.2+:

- ✅ `fast-diff` (v1.3.0+) - Diff algorithm
- ✅ `pako` (v2.1.0+) - Compression
- ✅ `fs-extra` (v11.3.0+) - File operations
- ✅ `uuid` (v9.0.0+) - UUID generation

### Verify Installation

```bash
# Check Node.js version
node --version
# Should output: v14.x or higher

# Check disk space
df -h /path/to/ngdpbase
# Ensure at least 1GB free

# Verify dependencies
cd /path/to/ngdpbase
npm list fast-diff pako fs-extra uuid
# All should be installed
```

---

## Installation

### Step 1: Backup Current Data

__CRITICAL__: Always backup before enabling versioning.

```bash
# Stop the wiki
npm run stop  # or: pm2 stop ngdpbase

# Create backup
cd /path/to/ngdpbase
tar -czf backup-before-versioning-$(date +%Y%m%d).tar.gz pages/ required-pages/ data/ config/

# Verify backup
tar -tzf backup-before-versioning-*.tar.gz | head
```

### Step 2: Update Configuration

Edit `data/config/app-custom-config.json`:

```json
{
  "_comment_versioning": "Enable page versioning",
  "ngdpbase.page.provider": "versioningfileprovider",

  "_comment_versioning_storage": "Storage configuration",
  "ngdpbase.page.provider.versioning.storagedir": "./pages",
  "ngdpbase.page.provider.versioning.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.versioning.indexfile": "./data/page-index.json",

  "_comment_versioning_settings": "Retention and optimization",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10,
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

### Step 3: Initialize Versioning

Start the wiki - it will automatically initialize versioning:

```bash
./server.sh start
```

__What Happens__:

1. Creates `./pages/versions/` directory
2. Creates `./required-pages/versions/` directory
3. Creates `./data/page-index.json`
4. Scans existing pages and creates v1 for each
5. Builds initial page index

__Monitor the logs__:

```bash
# Application logs (recommended - detailed Winston logs)
tail -f logs/app.log

# Or PM2 console output
tail -f logs/pm2-out.log

# Or use the server script
./server.sh logs
```

Look for:

```
[VersioningFileProvider] Initialized with versioning enabled
[VersioningFileProvider] Delta storage: enabled
[VersioningFileProvider] Compression: enabled
[VersioningFileProvider] Max versions: 50, Retention: 365 days
```

---

## Configuration

### Core Settings

#### Provider Selection

```json
{
  "ngdpbase.page.provider": "versioningfileprovider"
}
```

__Options__:

- `"filesystemprovider"` - Basic file storage (no versioning)
- `"versioningfileprovider"` - File storage with version history

__Note__: Switching providers requires restart.

#### Storage Locations

```json
{
  "ngdpbase.page.provider.versioning.storagedir": "./pages",
  "ngdpbase.page.provider.versioning.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.versioning.indexfile": "./data/page-index.json"
}
```

__Important__:

- Use existing page directories
- Paths can be absolute or relative to project root
- Ensure write permissions

#### Retention Policy

```json
{
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365
}
```

__Guidelines__:

| Wiki Size | Max Versions | Retention Days | Rationale |
| ----------- | -------------- | ---------------- | ----------- |
| Small (<100 pages) | 50 | 365 | Keep full history |
| Medium (100-1000) | 30 | 180 | Balance storage/history |
| Large (>1000 pages) | 20 | 90 | Optimize storage |
| High-traffic | 30 | 90 | Frequent edits |

#### Storage Optimization

```json
{
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10
}
```

__Compression__:

- `"gzip"` - Enable compression (recommended)
- `"none"` - Disable compression

__Delta Storage__:

- `true` - Store diffs (saves 80-90% space)
- `false` - Store full content each version

__Checkpoint Interval__:

- Store full content every N versions
- Lower = faster retrieval, more storage
- Higher = slower retrieval, less storage
- Recommended: 10 for most wikis

#### Performance Settings

```json
{
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

__Cache Size__:

- Number of versions to keep in memory
- Higher = more RAM, faster access
- Lower = less RAM, more disk I/O

__Recommendations__:

- Small wiki: 20-30
- Medium wiki: 50-100
- Large wiki: 100-200

---

## Migration

### Automatic Migration

VersioningFileProvider automatically migrates existing pages on first startup.

#### Migration Process

1. __Scan__: Finds all existing `.md` files
2. __Create v1__: Creates initial version for each page
3. __Index__: Builds page-index.json
4. __Verify__: Checks all pages migrated successfully

#### Monitor Migration

```bash
# Watch logs during startup (application logs recommended)
tail -f logs/app.log | grep Versioning

# Or watch PM2 console output
tail -f logs/pm2-out.log | grep Versioning

# Check migration status
ls -la data/page-index.json
cat data/page-index.json | jq '.pageCount'

# Verify version directories created
ls -la pages/versions/
ls -la required-pages/versions/
```

### Manual Migration (Optional)

Use the migration script for more control:

```bash
# Dry run (preview)
npm run migrate:versioning:dry

# Verbose output
npm run migrate:versioning:verbose

# Actual migration
npm run migrate:versioning
```

### Post-Migration Verification

```bash
# Check page index
cat data/page-index.json | jq '.pageCount'
# Should match number of pages

# Verify a few pages have versions
ls pages/versions/*/v1/content.md | head -5

# Test version retrieval
curl http://localhost:3000/api/page/Main/versions
```

---

## Testing

### Functional Testing

#### Test 1: Create New Page

```bash
# Create a page via UI or API
curl -X POST http://localhost:3000/wiki/TestPage \
  -H "Content-Type: application/json" \
  -d '{"content": "# Test\n\nInitial content"}'

# Verify v1 created
ls pages/versions/*/v1/ | grep TestPage
```

#### Test 2: Edit Page

```bash
# Edit the page
curl -X POST http://localhost:3000/save/TestPage \
  -H "Content-Type: application/json" \
  -d '{"content": "# Test\n\nUpdated content"}'

# Verify v2 created
ls pages/versions/*/v2/ | grep TestPage

# Check version history
curl http://localhost:3000/api/page/TestPage/versions
```

#### Test 3: Compare Versions

```bash
# Compare v1 and v2
curl http://localhost:3000/api/page/TestPage/compare/1/2

# Should return diff
```

#### Test 4: Restore Version

```bash
# Restore to v1
curl -X POST http://localhost:3000/api/page/TestPage/restore/1 \
  -H "Content-Type: application/json" \
  -b "connect.sid=your-session-cookie" \
  -d '{"comment": "Test restore"}'

# Verify v3 created
ls pages/versions/*/v3/
```

### Performance Testing

#### Test Version Retrieval Speed

```bash
# Time version list retrieval
time curl http://localhost:3000/api/page/Main/versions

# Should be < 100ms for <50 versions
```

#### Test Large Page Handling

```bash
# Create large page (>100KB)
dd if=/dev/urandom bs=1k count=100 | base64 > large-content.txt
curl -X POST http://localhost:3000/save/LargePage \
  --data-urlencode "content@large-content.txt"

# Verify versions still work
curl http://localhost:3000/api/page/LargePage/versions
```

### Load Testing (Optional)

```bash
# Install artillery
npm install -g artillery

# Create test scenario
cat > load-test.yml <<EOF
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Version History"
    flow:
      - get:
          url: "/api/page/Main/versions"
EOF

# Run load test
artillery run load-test.yml
```

---

## Performance Tuning

### Storage Optimization

#### Enable Compression

Reduces storage by 40-60%:

```json
{
  "ngdpbase.page.provider.versioning.compression": "gzip"
}
```

#### Optimize Checkpoint Interval

Balance speed vs storage:

```json
{
  "ngdpbase.page.provider.versioning.checkpointinterval": 5
}
```

__Trade-offs__:

- Lower (5): 20% more storage, 2x faster retrieval
- Default (10): Balanced
- Higher (20): 10% less storage, 50% slower retrieval

#### Adjust Retention

Reduce storage by lowering retention:

```json
{
  "ngdpbase.page.provider.versioning.maxversions": 30,
  "ngdpbase.page.provider.versioning.retentiondays": 90
}
```

### Memory Optimization

#### Adjust Cache Size

```json
{
  "ngdpbase.page.provider.versioning.cachesize": 100
}
```

__Memory Usage__:

- Small pages (5KB): ~10KB per entry
- Large pages (100KB): ~110KB per entry
- 100 entries × 20KB avg = ~2MB

### Database Optimization

#### Page Index Optimization

Keep page index compact:

```bash
# Check index size
du -h data/page-index.json

# If too large (>10MB), consider cleanup
npm run maintain:analyze
```

### Network Optimization

#### Enable Response Compression

In main app config:

```json
{
  "ngdpbase.compression.enabled": true
}
```

---

## Monitoring

### Key Metrics

#### Storage Usage

```bash
# Check version storage size
du -sh pages/versions/
du -sh required-pages/versions/
du -sh data/page-index.json

# Get detailed breakdown
npm run maintain:analyze
```

#### Version Distribution

```bash
# Count versions per page
find pages/versions -name "manifest.json" -exec jq '.currentVersion' {} \; | \
  awk '{sum+=$1; count+=1} END {print "Avg versions:", sum/count}'
```

#### Cache Performance

Monitor logs for cache hits:

```bash
grep "Version cache" logs/app.log | tail -20
```

### Health Checks

#### Verify Version Integrity

```bash
# Check for missing version files
node scripts/verify-versions.js

# Check manifest consistency
npm run maintain:verify
```

#### Check for Corruption

```bash
# Validate JSON files
find data -name "*.json" -exec node -c {} \;

# Check for orphaned version directories
find pages/versions -type d -empty
```

### Logging

#### Enable Debug Logging

```json
{
  "ngdpbase.logging.level": "debug",
  "ngdpbase.logging.debug.versioning": true
}
```

#### Log Rotation

```bash
# Configure in logger
{
  "ngdpbase.logging.rotation": {
    "enabled": true,
    "maxFiles": 10,
    "maxSize": "10m"
  }
}
```

---

## Backup and Recovery

### Backup Strategy

#### What to Backup

1. __Pages directories__:
   - `./pages/`
   - `./required-pages/`

2. __Version storage__:
   - `./pages/versions/`
   - `./required-pages/versions/`

3. __Index files__:
   - `./data/page-index.json`

4. __Configuration__:
   - `./data/config/app-custom-config.json`

#### Backup Script

```bash
#!/bin/bash
# backup-wiki-versions.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/backups/ngdpbase"
WIKI_DIR="/path/to/ngdpbase"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup with compression
tar -czf "$BACKUP_DIR/wiki-versions-$DATE.tar.gz" \
  -C "$WIKI_DIR" \
  pages/ \
  required-pages/ \
  data/page-index.json \
  data/config/app-custom-config.json

# Keep only last 7 days
find "$BACKUP_DIR" -name "wiki-versions-*.tar.gz" -mtime +7 -delete

echo "Backup completed: wiki-versions-$DATE.tar.gz"
```

#### Automated Backups

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/backup-wiki-versions.sh
```

### Recovery Procedures

#### Full Restore

```bash
# Stop wiki
npm run stop

# Extract backup
tar -xzf wiki-versions-20241016.tar.gz -C /path/to/ngdpbase

# Verify restoration
ls -la pages/ required-pages/ data/page-index.json

# Start wiki
npm start
```

#### Partial Restore (Single Page)

```bash
# Extract specific page versions
tar -xzf wiki-versions-20241016.tar.gz \
  pages/versions/PAGE-UUID/ \
  --strip-components=2

# Copy to production
cp -r PAGE-UUID/ /path/to/ngdpbase/pages/versions/
```

---

## Troubleshooting

### Common Issues

#### Issue: "Versioning not initialized"

__Symptoms__: API returns 501 errors

__Causes__:

- Provider not set to `versioningfileprovider`
- Directories not created
- Permission issues

__Solutions__:

```bash
# Check configuration
cat data/config/app-custom-config.json | grep provider

# Check directories
ls -la pages/versions/
ls -la data/page-index.json

# Check permissions
chmod -R 755 pages/ required-pages/ data/

# Restart
npm restart
```

#### Issue: "Page index not found"

__Symptoms__: Errors mentioning page-index.json

__Solutions__:

```bash
# Check if file exists
ls -la data/page-index.json

# Recreate manually
npm run migrate:versioning

# Or create empty index
mkdir -p data
echo '{"version":"1.0.0","lastUpdated":"'$(date -Iseconds)'","pageCount":0,"pages":{}}' > data/page-index.json
```

#### Issue: "Version reconstruction failed"

__Symptoms__: Errors retrieving specific versions

__Causes__:

- Corrupted diff files
- Missing checkpoint
- Disk errors

__Solutions__:

```bash
# Verify version files
ls pages/versions/PAGE-UUID/

# Check for missing files
npm run maintain:verify

# Rebuild from backups if needed
```

#### Issue: High disk usage

__Symptoms__: Disk space filling rapidly

__Solutions__:

```bash
# Check storage usage
npm run maintain:analyze

# Run cleanup
npm run maintain:cleanup -- --keep-latest 20 --retention 90

# Enable compression if disabled
# Edit config: "compression": "gzip"

# Consider lowering retention
# Edit config: "maxversions": 30
```

#### Issue: Slow version retrieval

__Symptoms__: API calls taking >1 second

__Causes__:

- High checkpoint interval
- Many versions to reconstruct
- Small cache size

__Solutions__:

```json
{
  "checkpointinterval": 5,
  "cachesize": 100
}
```

### Debug Mode

Enable verbose logging:

```json
{
  "ngdpbase.logging.level": "debug",
  "ngdpbase.logging.debug.versioning": true,
  "ngdpbase.logging.debug.provider": true
}
```

View logs:

```bash
tail -f logs/app.log | grep -E "Versioning|Provider"
```

---

## Rollback Procedures

### Disable Versioning

To revert to FileSystemProvider:

#### Step 1: Backup Version Data

```bash
tar -czf version-data-backup-$(date +%Y%m%d).tar.gz \
  pages/versions/ \
  required-pages/versions/ \
  data/page-index.json
```

#### Step 2: Update Configuration

```json
{
  "ngdpbase.page.provider": "filesystemprovider"
}
```

#### Step 3: Restart

```bash
npm restart
```

#### Step 4: Verify

```bash
# Should show 501 errors (expected)
curl http://localhost:3000/api/page/Main/versions
```

### Re-enable Later

To re-enable versioning:

1. Change provider back to `versioningfileprovider`
2. Restart
3. Version data is preserved and immediately available

---

## Best Practices

### Configuration

1. __Start Conservative__: Begin with default settings
2. __Monitor First Month__: Track storage and performance
3. __Adjust Gradually__: Make small configuration changes
4. __Document Changes__: Keep notes on why settings changed

### Maintenance

1. __Weekly__: Check disk usage
2. __Monthly__: Run analytics report
3. __Quarterly__: Run cleanup with dry-run first
4. __Annually__: Review retention policies

### Security

1. __Restrict Access__: Limit who can restore versions
2. __Audit Logs__: Monitor version operations
3. __Backup Regularly__: Automate daily backups
4. __Test Restores__: Verify backups work

### Performance

1. __Enable Compression__: Always (unless disk I/O is bottleneck)
2. __Use Delta Storage__: Always (huge savings)
3. __Tune Cache Size__: Based on available RAM
4. __Monitor Metrics__: Track retrieval times

---

## Support and Resources

### Documentation

- [User Guide](../user-guide/Using-Version-History.md)
- [API Reference](../api/Versioning-API.md)
- [Maintenance Guide](../Versioning-Maintenance-Guide.md)

### Tools

- `npm run migrate:versioning` - Migration script
- `npm run maintain:cleanup` - Version cleanup
- `npm run maintain:analyze` - Storage analytics
- `npm run maintain:compress` - Compress old versions

### Getting Help

1. Check logs: `logs/app.log` (application logs) or `./server.sh logs` (PM2 logs)
2. Review documentation
3. Run analytics: `npm run maintain:analyze`
4. Check GitHub issues

---

## Appendix

### Configuration Reference

Complete list of all versioning settings:

```json
{
  "ngdpbase.page.provider": "versioningfileprovider",
  "ngdpbase.page.provider.versioning.storagedir": "./pages",
  "ngdpbase.page.provider.versioning.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.versioning.indexfile": "./data/page-index.json",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true,
  "ngdpbase.page.provider.versioning.checkpointinterval": 10,
  "ngdpbase.page.provider.versioning.cachesize": 50
}
```

### Directory Structure

```
ngdpbase/
├── pages/
│   ├── {uuid}.md                    # Current page content
│   └── versions/
│       └── {uuid}/
│           ├── manifest.json        # Version metadata
│           ├── v1/
│           │   ├── content.md       # Full content
│           │   └── meta.json
│           ├── v2/
│           │   ├── content.diff     # Delta from v1
│           │   └── meta.json
│           └── v3/
│               ├── content.diff
│               └── meta.json
├── required-pages/
│   └── versions/                    # Same structure
├── data/
│   ├── page-index.json              # Centralized index
│   └── config/
│       └── app-custom-config.json   # Instance configuration
└── config/
    └── app-default-config.json      # Default configuration (read-only)
```

---

__Last Updated__: 2026-02-06
__Version__: 1.0
__Applies to__: ngdpbase 1.3.2+
