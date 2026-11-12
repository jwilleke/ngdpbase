[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionManifest

# Interface: VersionManifest

Defined in: src/types/Version.ts:57

Version manifest

Single source of truth for all versions of a page. Stored as manifest.json
in the page's version directory.

## Properties

### config?

> `optional` __config?__: `object`

Defined in: src/types/Version.ts:80

Versioning configuration at time of creation

#### checkpointInterval

> __checkpointInterval__: `number`

#### compressionEnabled

> __compressionEnabled__: `boolean`

#### deltaStorageEnabled

> __deltaStorageEnabled__: `boolean`

***

### createdAt

> __createdAt__: `string`

Defined in: src/types/Version.ts:74

Manifest creation timestamp

***

### currentVersion

> __currentVersion__: `number`

Defined in: src/types/Version.ts:68

Current version number

***

### pageTitle

> __pageTitle__: `string`

Defined in: src/types/Version.ts:62

Page title (for reference)

***

### pageUuid

> __pageUuid__: `string`

Defined in: src/types/Version.ts:59

Page UUID

***

### totalVersions

> __totalVersions__: `number`

Defined in: src/types/Version.ts:65

Total number of versions

***

### updatedAt

> __updatedAt__: `string`

Defined in: src/types/Version.ts:77

Last manifest update timestamp

***

### versions

> __versions__: [`VersionMetadata`](VersionMetadata.md)[]

Defined in: src/types/Version.ts:71

Array of version metadata (sorted by version number)
