[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvBackup](../README.md) / siteRestoreFileAtBoot

# Function: siteRestoreFileAtBoot()

> __siteRestoreFileAtBoot__(`instanceDataDir`, `env?`, `cwd?`): `string`

Defined in: src/utils/instanceEnvBackup.ts:105

The site restore manifest's path, read before the configuration exists:
`ngdpbase.backup.restore-manifest` from the custom file, else the shipped
default, with `${FAST_STORAGE}` (and `./data`) resolved to the instance data
folder and `${SLOW_STORAGE}` to its variable — as `getResolvedDataPath`
resolves it once the configuration is loaded.

## Parameters

### instanceDataDir

`string`

### env?

`Record`\<`string`, `string` \| `undefined`\> = `process.env`

### cwd?

`string` = `...`

## Returns

`string`
