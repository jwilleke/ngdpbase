[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Version](../README.md) / VersionDiff

# Interface: VersionDiff

Defined in: src/types/Version.ts:108

Version diff result

Result of comparing two versions.

## Properties

### diff

> __diff__: [`DiffTuple`](../../../utils/DeltaStorage/type-aliases/DiffTuple.md)[]

Defined in: src/types/Version.ts:116

Diff operations (from fast-diff)

***

### fromMetadata

> __fromMetadata__: [`VersionMetadata`](VersionMetadata.md)

Defined in: src/types/Version.ts:126

Old version metadata

***

### fromVersion

> __fromVersion__: `number`

Defined in: src/types/Version.ts:110

Old version number

***

### stats

> __stats__: `object`

Defined in: src/types/Version.ts:119

Diff statistics

#### additions

> __additions__: `number`

#### deletions

> __deletions__: `number`

#### unchanged

> __unchanged__: `number`

***

### toMetadata

> __toMetadata__: [`VersionMetadata`](VersionMetadata.md)

Defined in: src/types/Version.ts:129

New version metadata

***

### toVersion

> __toVersion__: `number`

Defined in: src/types/Version.ts:113

New version number
