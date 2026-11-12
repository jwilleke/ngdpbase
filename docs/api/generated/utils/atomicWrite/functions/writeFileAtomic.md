[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/atomicWrite](../README.md) / writeFileAtomic

# Function: writeFileAtomic()

> __writeFileAtomic__(`filePath`, `data`, `encoding?`, `options?`): `Promise`\<`void`\>

Defined in: src/utils/atomicWrite.ts:74

Write `data` to `filePath` so that the path is never observed partially
written.

The temp file carries the pid and a per-process counter so two writers — or
two processes sharing a volume — cannot collide on it and corrupt each
other's staging file.

## Parameters

### filePath

`string`

final destination

### data

`string` \| `Buffer`\<`ArrayBufferLike`\>

contents to write

### encoding?

`BufferEncoding` = `'utf8'`

defaults to utf8

### options?

#### exclusive?

`boolean`

create only: refuse (EEXIST) when `filePath`
  already exists, instead of replacing it (#1625). The finished temp file is
  published with a hard link, which fails atomically if the name is taken,
  so a crash mid-write never leaves a truncated file under the real name.

#### fsync?

`boolean`

also flush to the device. Off by default; see the file
  header for why, and for the measured cost.

#### mode?

`number`

permission bits for the file, e.g. `0o600` for a file
  holding secrets (#1524, #1560). Set on the temp file before any data is
  written, so the secret is never on disk with wider permissions; the rename
  keeps them. Absent: the process default, as before.

## Returns

`Promise`\<`void`\>
