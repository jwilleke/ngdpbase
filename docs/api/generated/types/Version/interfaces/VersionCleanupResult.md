[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionCleanupResult

# Interface: VersionCleanupResult

Defined in: src/types/Version.ts:227

Version cleanup result

Result of running version cleanup/maintenance.

## Properties

### deletedVersions

> __deletedVersions__: `number`[]

Defined in: src/types/Version.ts:244

Deleted version numbers

***

### errors?

> `optional` __errors?__: `string`[]

Defined in: src/types/Version.ts:247

Errors encountered

***

### pageUuid

> __pageUuid__: `string`

Defined in: src/types/Version.ts:229

Page UUID

***

### spaceFreed

> __spaceFreed__: `number`

Defined in: src/types/Version.ts:241

Space freed in bytes

***

### versionsAfter

> __versionsAfter__: `number`

Defined in: src/types/Version.ts:235

Number of versions after cleanup

***

### versionsBefore

> __versionsBefore__: `number`

Defined in: src/types/Version.ts:232

Number of versions before cleanup

***

### versionsDeleted

> __versionsDeleted__: `number`

Defined in: src/types/Version.ts:238

Number of versions deleted
