[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/VersioningMaintenance](../README.md) / default

# Class: default

Defined in: src/utils/VersioningMaintenance.ts:220

VersioningMaintenance - Automated maintenance utilities for VersioningFileProvider

Provides batch operations for:

- Version cleanup (purging old versions)
- Version compression (gzip old versions)
- Storage analytics (usage statistics)
- Automated maintenance scheduling

## Example

```ts
const maintenance = new VersioningMaintenance({
  provider: versioningProvider,
  dryRun: false
});

const report = await maintenance.cleanupAllPages({
  keepLatest: 20,
  retentionDays: 90
});
```

## Constructors

### Constructor

> __new default__(`options`): `VersioningMaintenance`

Defined in: src/utils/VersioningMaintenance.ts:231

Create a new VersioningMaintenance instance

#### Parameters

##### options

`MaintenanceOptions`

Maintenance options

#### Returns

`VersioningMaintenance`

## Methods

### cleanupAllPages()

> __cleanupAllPages__(`options?`): `Promise`\<`CleanupReport`\>

Defined in: src/utils/VersioningMaintenance.ts:260

Clean up old versions for all pages

Performs batch purge operation across all pages with version history.

#### Parameters

##### options?

`CleanupOptions` = `{}`

Cleanup options

#### Returns

`Promise`\<`CleanupReport`\>

Cleanup report

***

### compressAllVersions()

> __compressAllVersions__(`options?`): `Promise`\<`CompressionReport`\>

Defined in: src/utils/VersioningMaintenance.ts:332

Compress old versions for all pages

Applies gzip compression to versions older than specified threshold.
Significantly reduces storage usage for old versions.

#### Parameters

##### options?

`CompressionOptions` = `{}`

Compression options

#### Returns

`Promise`\<`CompressionReport`\>

Compression report

***

### runFullMaintenance()

> __runFullMaintenance__(`options?`): `Promise`\<`FullMaintenanceReport`\>

Defined in: src/utils/VersioningMaintenance.ts:504

Run full maintenance (cleanup + compression)

Performs both cleanup and compression in a single operation.

#### Parameters

##### options?

`FullMaintenanceOptions` = `{}`

Maintenance options

#### Returns

`Promise`\<`FullMaintenanceReport`\>

Combined maintenance report
