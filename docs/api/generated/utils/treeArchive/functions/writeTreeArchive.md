[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/treeArchive](../README.md) / writeTreeArchive

# Function: writeTreeArchive()

> __writeTreeArchive__(`target`, `root`, `options?`): `Promise`\<[`TreeArchiveOutcome`](../interfaces/TreeArchiveOutcome.md)\>

Defined in: src/utils/treeArchive.ts:80

Write `entries` (paths relative to `root`; default: everything in it) into
`target`, streamed. `exclude` leaves out a path relative to `root`, in
posix form. A missing `root` writes an empty archive. Never overwrites.

An entry deleted while the archive is written (#1563) — the tar stream
stops at the first file it can no longer find — is not a failure: the
archive is written again from a fresh listing, without it, and the entry
is named in `vanished`. It is written again only while each attempt finds
another entry gone, so it ends once the deleting stops; the same entry
missing twice, or one still there, is a real failure.

## Parameters

### target

`string`

### root

`string`

### options?

`TreeArchiveOptions` = `{}`

## Returns

`Promise`\<[`TreeArchiveOutcome`](../interfaces/TreeArchiveOutcome.md)\>
