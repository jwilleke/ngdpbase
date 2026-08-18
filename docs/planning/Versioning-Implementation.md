# VersioningFileProvider

## Relationship With BackupManager

Backup manager runs periodically and creates full backups of all files.

## Step one FileSystemProvider (non-versioning)

Explore performing abstraction from existing code to FileSystemProvider for what we are doing now.

We would use something like
wikiContext.getEngine().getManager( PageManager.class ).getCurrentPageProvider(); would return the "ngdpbase.pageProvider" we are using currently.

All components for pages and page data should make all calls for retrieval and writes to the "ngdpbase.pageProvider": "FileSystemProvider"

This would be in preparation to moving to different pageProviders in the future.

## VersioningFileProvider

### Page attributes Required

Use <https://schema.org/DigitalDocument> as JSON.

- author - The author of this content or rating. Please note that author is special in that HTML 5 provides a special mechanism for indicating authorship via the rel tag. That is equivalent to this and may be used interchangeably.
- dateCreated - The date on which the CreativeWork was created or the item was added to a DataFeed.
- editor - Specifies the Person who edited the CreativeWork.
- dateModified - The date on which the CreativeWork was most recently modified or when the item's entry was modified within a DataFeed.
- encodingFormat - <https://schema.org/encodingFormat> Use <https://www.iana.org/assignments/media-types/media-types.xhtml>
- isBasedOn - "optional" A resource from which this work is derived or from which it is a modification or adaptation. Supersedes isBasedOnUrl.
- isBasedOnUrl - "Optional"
- isFamilyFriendly - Assumed so unless set to false
- other  "Optional" values as needed.

## VersioningFileProvider Configuration

### Default Config (app-default-config.json)

Leave FileSystemProvider as the stable default:

```json
{
  "_comment_page_storage": "Page storage configuration (ALL LOWERCASE)",
  "ngdpbase.page.enabled": true,
  "ngdpbase.page.provider.default": "filesystemprovider",
  "ngdpbase.page.provider": "filesystemprovider",
  "ngdpbase.page.provider.filesystem.storagedir": "./pages",
  "ngdpbase.page.provider.filesystem.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.filesystem.encoding": "utf-8",
  "ngdpbase.page.provider.filesystem.autosave": true
}
```

### Custom Config (app-custom-config.json) - Opt-in to Versioning

To enable versioning, add to your custom config:

```json
{
  "_comment_versioning": "Enable page versioning by switching provider",
  "ngdpbase.page.provider": "versioningfileprovider",

  "_comment_versioning_storage": "Versioning storage configuration (ALL LOWERCASE)",
  "ngdpbase.page.provider.versioning.storagedir": "./pages",
  "ngdpbase.page.provider.versioning.requiredpagesdir": "./required-pages",
  "ngdpbase.page.provider.versioning.indexfile": "./data/page-index.json",
  "ngdpbase.page.provider.versioning.encoding": "utf-8",
  "ngdpbase.page.provider.versioning.autosave": true,

  "_comment_versioning_settings": "Version retention and optimization",
  "ngdpbase.page.provider.versioning.maxversions": 50,
  "ngdpbase.page.provider.versioning.retentiondays": 365,
  "ngdpbase.page.provider.versioning.compression": "gzip",
  "ngdpbase.page.provider.versioning.deltastorage": true
}
```

### Development Config (app-development-config.json) - Testing Versioning

For testing versioning in development:

```json
{
  "ngdpbase.page.provider": "versioningfileprovider",
  "ngdpbase.page.provider.versioning.maxversions": 10,
  "ngdpbase.page.provider.versioning.compression": "none"
}
```

__Note:__ No separate `enabled` flag needed - switching to `versioningfileprovider` enables versioning

## VersioningFileProvider Structure

VersioningFileProvider maintains current page storage locations and adds versioning structure:

```
./data/
  └── page-index.json          (metadata index for ALL pages - both regular and required)

./pages/                       (stays in current location - NOT moved)
  ├── {uuid}.md                (current page content with frontmatter)
  └── versions/                (version history stored alongside pages)
      └── {uuid}/
          ├── manifest.json    (SINGLE SOURCE OF TRUTH for all version metadata)
          ├── v1/
          │   └── content.md   (full content for v1)
          ├── v2/
          │   └── content.diff (delta from v1 if deltastorage:true)
          └── v3/
              └── content.diff (delta from v2 if deltastorage:true)

./required-pages/              (stays in current location - NOT moved)
  ├── {uuid}.md                (current required page content)
  └── versions/                (version history for required pages)
      └── {uuid}/
          ├── manifest.json    (SINGLE SOURCE OF TRUTH for all version metadata)
          ├── v1/
          │   └── content.md
          └── v2/
              └── content.diff
```

__Design Rationale:__

- __Centralized index__: `./data/page-index.json` provides fast lookup across all pages
- __Co-located versions__: Version history lives in `versions/` subfolder within each directory
- __Minimal migration__: Pages stay in current locations, reducing migration complexity
- __Delta storage__: v1 stores full content, v2+ stores diffs (saves disk space)
- __Scalability__: Nested version folders scale to thousands of versions per page
- __Single source of truth__: All version metadata (author, date, hash, etc.) stored ONLY in `manifest.json` to prevent inconsistency. Individual v{N}/meta.json files are NOT used.

## Missing Metadata Fields

Add to schema.org properties:

- version - version number (integer)
- contentSize - byte size for integrity checks
- sha256 - content hash for deduplication & integrity
- copyrightHolder - important for wikis
- license - content license (CC-BY-SA, etc.)
- keywords - tags/categories array

## From Claude

### Suggestions & Improvements

## Version History

```json
  {
    "pageId": "uuid",
    "currentVersion": 3,
    "versions": [
      {
        "version": 1,
        "dateCreated": "ISO-8601",
        "author": "user@email",
        "changeType": "created|updated|renamed|restored",
        "comment": "Version comment",
        "contentHash": "sha256",
        "contentSize": 1234
      }
    ]
  }
```

## Provider Interface Design

```javascript
  interface PageProvider {
    // Current operations
    getPage(uuid, version?);
    savePage(uuid, content, metadata);
    deletePage(uuid, softDelete?);

    // Versioning operations
    getVersionHistory(uuid);
    restoreVersion(uuid, version);
    compareVersions(uuid, v1, v2);
    purgeVersions(uuid, keepLatest);

    // Search & listing
    listPages(filter?);
    searchPages(query);
  }
```

## Performance Optimizations

### Delta Storage Implementation

- __Library__: Use `fast-diff` (npm package) for efficient text diffing
- __Storage__: v1 = full content, v2+ = diffs from previous version
- __Retrieval__: Load v1, sequentially apply diffs to reconstruct any version
- __Benefits__: 80-95% disk space savings for text-heavy wikis
- __Algorithm__: Myers diff algorithm (similar to git)

### Additional Optimizations

- __Compression__: gzip old versions (especially diffs compress well)
- __Lazy loading__: Don't load version history unless requested
- __Caching__: Cache current versions in memory (FileSystemProvider already does this)
- __Parallel reconstruction__: For frequently accessed versions, cache reconstructed content

### Implementation Libraries

```bash
npm install fast-diff      # Text diffing (fast, lightweight)
npm install pako           # gzip compression/decompression
```

### Example Delta Storage

```javascript
// Creating v2 from v1
const Diff = require('fast-diff');
const diff = Diff(v1Content, v2Content);
fs.writeFileSync('v2/content.diff', JSON.stringify(diff));

// Reconstructing v2 from v1
const diff = JSON.parse(fs.readFileSync('v2/content.diff'));
const v2Content = applyDiff(v1Content, diff);
```

## Migration Strategy

Detect on loading VersioningFileProvider if ./data/page-index.json exists if not then

- Initiate BackupManager
- create a v1 Version of all pages populating
  - ./data/page-index.json
  - Versioning Structure for
    - ./pages/
    - ./required-pages/
  
Document the migration path:

1. Backup existing pages
2. Run migration script to create UUIDs for existing pages
3. Import into new structure
4. Verify integrity
5. Switch provider in config

## Additional Features to Consider

- Conflict resolution: For concurrent edits - Imitate Page Lock for page
- Soft delete:
  - Mark page as softDelete=true until next run of BackupManager then hard delete
- Audit trail: Maybe Future Who accessed what and when
- Bulk operations: Maybe Future: Export/import multiple versions
- Diff generation: Maybe Future: HTML/markdown diff view

## Testing Requirements

- Unit tests for provider operations
- Integration tests for version management
- Performance tests with 1000+ pages
- Concurrent access tests
- Corruption recovery tests

## Documentation Needs

- API documentation for provider interface
- Migration guide
- Performance benchmarks
- Backup/restore procedures to revert to version JSPWiki on a per-page basis

## Version Management

We already have under "Info" Button on NavBar "Page History" in dropdown.

This should initiate a PageInfo.jsp?page=Arteriolosclerosis#history

Similar to [Page History](pagehistory.html)

Clicking on a "Changes" opens a tab "Version management" showing "Difference between version "##" and "##"

<http://192.168.68.127:8080/Diff.jsp?page=Arteriolosclerosis&r1=3&r2=2>
