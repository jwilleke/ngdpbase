[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / discoverAddonDirs

# Function: discoverAddonDirs()

> __discoverAddonDirs__(`base`, `cwd?`, `dataFolder?`): `object`[]

Defined in: src/utils/addonConfigLayer.ts:99

Every addon directory the configured path names, plus the installed add-ons
in `<data>/addons` (#1830: only those the lock file names for a slug in the
install map), whether or not it is enabled.

## Parameters

### base

`Record`\<`string`, `unknown`\>

### cwd?

`string` = `...`

### dataFolder?

`string` = `...`

## Returns

`object`[]
