[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionStorageInfo

# Interface: VersionStorageInfo

Defined in: src/types/Version.ts:165

Version storage info

Information about version storage and disk usage.

## Properties

### avgVersionSize

> __avgVersionSize__: `number`

Defined in: src/types/Version.ts:182

Average version size

***

### compressedVersions

> __compressedVersions__: `number`

Defined in: src/types/Version.ts:185

Number of compressed versions

***

### deltaVersions

> __deltaVersions__: `number`

Defined in: src/types/Version.ts:188

Number of delta versions

***

### newestVersion

> __newestVersion__: `string`

Defined in: src/types/Version.ts:194

Newest version timestamp

***

### oldestVersion

> __oldestVersion__: `string`

Defined in: src/types/Version.ts:191

Oldest version timestamp

***

### pageUuid

> __pageUuid__: `string`

Defined in: src/types/Version.ts:167

Page UUID

***

### spaceSavings

> __spaceSavings__: `number`

Defined in: src/types/Version.ts:179

Space saved (0-100)

***

### storageSize

> __storageSize__: `number`

Defined in: src/types/Version.ts:176

Storage size with compression/deltas in bytes

***

### totalSize

> __totalSize__: `number`

Defined in: src/types/Version.ts:173

Total storage size in bytes (all versions)

***

### totalVersions

> __totalVersions__: `number`

Defined in: src/types/Version.ts:170

Total number of versions
