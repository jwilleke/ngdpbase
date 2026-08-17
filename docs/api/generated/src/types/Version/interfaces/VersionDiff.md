[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Version](../README.md) / VersionDiff

# Interface: VersionDiff

Defined in: [src/types/Version.ts:108](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L108)

Version diff result

Result of comparing two versions.

## Properties

### diff

> __diff__: [`DiffTuple`](../../../utils/DeltaStorage/type-aliases/DiffTuple.md)[]

Defined in: [src/types/Version.ts:116](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L116)

Diff operations (from fast-diff)

***

### fromMetadata

> __fromMetadata__: [`VersionMetadata`](VersionMetadata.md)

Defined in: [src/types/Version.ts:126](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L126)

Old version metadata

***

### fromVersion

> __fromVersion__: `number`

Defined in: [src/types/Version.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L110)

Old version number

***

### stats

> __stats__: `object`

Defined in: [src/types/Version.ts:119](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L119)

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

Defined in: [src/types/Version.ts:129](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L129)

New version metadata

***

### toVersion

> __toVersion__: `number`

Defined in: [src/types/Version.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Version.ts#L113)

New version number
