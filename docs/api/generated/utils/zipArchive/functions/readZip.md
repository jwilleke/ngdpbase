[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/zipArchive](../README.md) / readZip

# Function: readZip()

> __readZip__(`archive`, `limits`): [`ZipEntry`](../type-aliases/ZipEntry.md)[]

Defined in: src/utils/zipArchive.ts:216

The files in a zip archive, as bytes in memory (#1472).

Read from the central directory, which is the archive's own table of
contents, so a member written with a data descriptor — what a streaming
writer, or an OS re-zipping a folder, produces — is read the same as any
other. Directory entries are dropped, and so is what macOS adds when it
zips a folder (`__MACOSX/`, `.DS_Store`): they are not anyone's data.

Refused, with an error naming why, rather than read as something else:

- a path that would climb out of wherever it is extracted — absolute, or
    holding a `..` segment, with `\` read as the separator it is on Windows;
- encryption, zip64, split archives, and any method but stored and deflate;
- a member whose inflated bytes do not match the size or CRC the archive
    declares for it;
- more members, or more inflated bytes, than `limits` allow. Inflating is
    capped per member at what is left of the budget, so a small archive
    that expands enormously stops at the budget, not at the machine's memory.

## Parameters

### archive

`Buffer`

### limits

[`ZipReadLimits`](../type-aliases/ZipReadLimits.md)

## Returns

[`ZipEntry`](../type-aliases/ZipEntry.md)[]
