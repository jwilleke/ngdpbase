[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/directoryBackup](../README.md) / archiveReadKey

# Function: archiveReadKey()

> __archiveReadKey__(`manager`, `data`): `string` \| `undefined`

Defined in: src/utils/directoryBackup.ts:61

The key to read an archive of a backup with, checked against the
fingerprint the backup recorded: a backup made under another key is
refused before anything is staged. None for a backup that was not
encrypted, which is then read as the plain archive it says it is.

## Parameters

### manager

`string`

### data

#### keyFingerprint?

`string`

## Returns

`string` \| `undefined`
