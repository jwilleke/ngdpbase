[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/zipArchive](../README.md) / ZipEntry

# Type Alias: ZipEntry

> __ZipEntry__ = `object`

Defined in: src/utils/zipArchive.ts:34

One file to put in the archive.

## Properties

### bytes

> __bytes__: `Buffer`

Defined in: src/utils/zipArchive.ts:37

***

### mtime?

> `optional` __mtime?__: `Date`

Defined in: src/utils/zipArchive.ts:39

Defaults to now. Zip stores 2-second resolution, and nothing before 1980.

***

### path

> __path__: `string`

Defined in: src/utils/zipArchive.ts:36

Path inside the archive, `/`-separated, no leading slash.
