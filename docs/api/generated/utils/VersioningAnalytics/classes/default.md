[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/VersioningAnalytics](../README.md) / default

# Class: default

Defined in: src/utils/VersioningAnalytics.ts:182

VersioningAnalytics - Storage analytics and reporting for VersioningFileProvider

Provides detailed insights into:

- Storage usage (total, per-page, by location)
- Version distribution (counts, ages)
- Compression effectiveness
- Growth trends
- Optimization recommendations

## Example

```ts
const analytics = new VersioningAnalytics({
  provider: versioningProvider
});

const report = await analytics.generateStorageReport();
console.log(`Total storage: ${report.totalStorageMB} MB`);
```

## Constructors

### Constructor

> __new default__(`options`): `VersioningAnalytics`

Defined in: src/utils/VersioningAnalytics.ts:189

Create a new VersioningAnalytics instance

#### Parameters

##### options

`AnalyticsOptions`

Analytics options

#### Returns

`VersioningAnalytics`

## Methods

### generateStorageReport()

> __generateStorageReport__(): `Promise`\<`StorageReport`\>

Defined in: src/utils/VersioningAnalytics.ts:205

Generate comprehensive storage report

Analyzes all pages and versions to provide detailed storage statistics.

#### Returns

`Promise`\<`StorageReport`\>

Storage report

***

### getPageStorageDetails()

> __getPageStorageDetails__(`identifier`): `Promise`\<`PageStorageDetails`\>

Defined in: src/utils/VersioningAnalytics.ts:482

Get storage usage for a specific page

#### Parameters

##### identifier

`string`

Page UUID or title

#### Returns

`Promise`\<`PageStorageDetails`\>

Page storage details
