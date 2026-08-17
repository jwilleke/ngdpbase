[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/utils/VersioningMigration](../README.md) / default

# Class: default

Defined in: [src/utils/VersioningMigration.ts:112](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersioningMigration.ts#L112)

VersioningMigration - Utility for migrating FileSystemProvider to VersioningFileProvider

Provides safe migration of existing ngdpbase pages to versioned format with:

- Full data preservation and validation
- Rollback capability
- Progress tracking
- Detailed reporting

## Example

```ts
const migration = new VersioningMigration({
  pagesDir: './pages',
  requiredPagesDir: './required-pages',
  dataDir: './data',
  dryRun: false
});

const report = await migration.migrateFromFileSystemProvider();
console.log(`Migrated ${report.pagesProcessed} pages`);
```

## Constructors

### Constructor

> __new default__(`options`): `VersioningMigration`

Defined in: [src/utils/VersioningMigration.ts:133](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersioningMigration.ts#L133)

Create a new VersioningMigration instance

#### Parameters

##### options

`MigrationOptions`

Migration options

#### Returns

`VersioningMigration`

## Methods

### migrateFromFileSystemProvider()

> __migrateFromFileSystemProvider__(): `Promise`\<`MigrationReport`\>

Defined in: [src/utils/VersioningMigration.ts:164](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersioningMigration.ts#L164)

Migrate existing pages from FileSystemProvider to VersioningFileProvider

Algorithm:

1. Scan all existing .md files in pages/ and required-pages/
2. For each page:
   a. Read and parse content + frontmatter
   b. Create version directory structure
   c. Create v1 with full content
   d. Create manifest.json
   e. Add entry to page-index.json
3. Validate migration integrity
4. Generate detailed report

#### Returns

`Promise`\<`MigrationReport`\>

Migration report with statistics

#### Throws

If migration fails critically

***

### rollbackMigration()

> __rollbackMigration__(): `Promise`\<`RollbackResult`\>

Defined in: [src/utils/VersioningMigration.ts:582](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersioningMigration.ts#L582)

Rollback migration (remove all versioning artifacts)

WARNING: This removes version directories and page-index.json.
Original page files are NOT affected.

#### Returns

`Promise`\<`RollbackResult`\>

Rollback result

***

### validateMigration()

> __validateMigration__(): `Promise`\<`ValidationResult`\>

Defined in: [src/utils/VersioningMigration.ts:478](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/utils/VersioningMigration.ts#L478)

Validate migration integrity

Checks:

- All pages have version directories
- manifest.json files are valid
- Content hashes match
- page-index.json is accurate

#### Returns

`Promise`\<`ValidationResult`\>

Validation result
