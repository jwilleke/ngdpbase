[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonsPathResolver](../README.md) / installedAddonsDir

# Function: installedAddonsDir()

> __installedAddonsDir__(`dataFolder`, `cwd?`): `string`

Defined in: src/utils/addonsPathResolver.ts:50

Where installed add-ons live (#1830): `<data>/addons`, one folder per slug.
Only a folder the lock file names, for a slug still in the install map, is
an add-on (see `addonLock.ts`); anything else there is never loaded.

## Parameters

### dataFolder

`string`

### cwd?

`string` = `...`

## Returns

`string`
