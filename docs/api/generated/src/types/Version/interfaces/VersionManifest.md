[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Version](../README.md) / VersionManifest

# Interface: VersionManifest

Defined in: [src/types/Version.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L57)

Version manifest

Single source of truth for all versions of a page. Stored as manifest.json
in the page's version directory.

## Properties

### config?

> `optional` __config__: `object`

Defined in: [src/types/Version.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L80)

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

Defined in: [src/types/Version.ts:74](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L74)

Manifest creation timestamp

***

### currentVersion

> __currentVersion__: `number`

Defined in: [src/types/Version.ts:68](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L68)

Current version number

***

### pageTitle

> __pageTitle__: `string`

Defined in: [src/types/Version.ts:62](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L62)

Page title (for reference)

***

### pageUuid

> __pageUuid__: `string`

Defined in: [src/types/Version.ts:59](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L59)

Page UUID

***

### totalVersions

> __totalVersions__: `number`

Defined in: [src/types/Version.ts:65](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L65)

Total number of versions

***

### updatedAt

> __updatedAt__: `string`

Defined in: [src/types/Version.ts:77](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L77)

Last manifest update timestamp

***

### versions

> __versions__: [`VersionMetadata`](VersionMetadata.md)[]

Defined in: [src/types/Version.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L71)

Array of version metadata (sorted by version number)
