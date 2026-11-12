[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/fileHandling](../README.md) / expandUploads

# Function: expandUploads()

> __expandUploads__(`uploads`, `limits`, `maxDepth`, `options?`, `depth?`): `object`

Defined in: src/ice/fileHandling.ts:130

Unpack the zips among the uploads into the files they hold, named
`archive.zip/inner/path`, each with its media type ([memberMediaType](memberMediaType.md),
# 2061). A nested zip is unpacked too. Everything else is passed through,
with the type its request gave it. Limits are per archive (`ZipReadLimits`), so a small
archive that expands enormously stops at the budget. An archive that cannot
be read is returned in `unreadable`, with why; the rest go on.

With `innerZipsAsFiles` (#2118), only the uploads themselves are unpacked:
a zip inside one is passed on as a file, like any other member.

## Parameters

### uploads

readonly [`IceUpload`](../../types/interfaces/IceUpload.md)[]

### limits

[`ZipReadLimits`](../../../utils/zipArchive/type-aliases/ZipReadLimits.md)

### maxDepth

`number`

### options?

#### innerZipsAsFiles?

`boolean`

### depth?

`number` = `0`

## Returns

`object`

### files

> __files__: [`IceUpload`](../../types/interfaces/IceUpload.md)[]

### unreadable

> __unreadable__: `object`[]
