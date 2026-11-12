[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonLock](../README.md) / lockedAddonDirsSync

# Function: lockedAddonDirsSync()

> __lockedAddonDirsSync__(`addonsDir`, `configuredSlugs`): `string`[]

Defined in: src/utils/addonLock.ts:69

The folders in `addonsDir` that are installed add-ons for this site: named
in the lock file AND in the configured install map, and present on disk.
An unreadable lock file names none.

## Parameters

### addonsDir

`string`

### configuredSlugs

`Iterable`\<`string`\>

## Returns

`string`[]
