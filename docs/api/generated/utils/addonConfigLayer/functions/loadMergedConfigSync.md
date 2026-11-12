[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / loadMergedConfigSync

# Function: loadMergedConfigSync()

> __loadMergedConfigSync__(`env?`, `cwd?`): [`MergedConfigFiles`](../interfaces/MergedConfigFiles.md) \| `null`

Defined in: src/utils/addonConfigLayer.ts:597

The merged configuration for a caller that runs before the engine exists
(#1214): the two files plus the addon layer, the same merge the manager
performs. Returns null on any failure: a missing or malformed file must not
stop the server binding a socket; the port simply falls back. No `${VAR}`
resolution and no env-key overrides — those are `getProperty`'s job.

## Parameters

### env?

`Record`\<`string`, `string` \| `undefined`\> = `process.env`

### cwd?

`string` = `...`

## Returns

[`MergedConfigFiles`](../interfaces/MergedConfigFiles.md) \| `null`
