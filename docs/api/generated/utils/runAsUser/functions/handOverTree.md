[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/runAsUser](../README.md) / handOverTree

# Function: handOverTree()

> __handOverTree__(`dir`, `uid`, `gid`, `out?`): [`HandOver`](../interfaces/HandOver.md)

Defined in: src/utils/runAsUser.ts:80

Give every entry under `dir` (and `dir`) to uid:gid, without following links
(#1695). Visits the whole tree whatever happens: an entry that cannot be
changed (a read-only ConfigMap file mounted inside the folder, a file on a
filesystem that maps owners itself) is recorded and skipped, never the end
of the walk. Only entries not already uid:gid are changed, so a second
start after a finished hand-over only reads owners.

## Parameters

### dir

`string`

### uid

`number`

### gid

`number`

### out?

[`HandOver`](../interfaces/HandOver.md) = `...`

## Returns

[`HandOver`](../interfaces/HandOver.md)
