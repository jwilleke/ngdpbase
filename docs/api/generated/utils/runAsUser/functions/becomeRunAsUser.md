[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/runAsUser](../README.md) / becomeRunAsUser

# Function: becomeRunAsUser()

> __becomeRunAsUser__(`env`, `dataDir`, `slowDir`, `ids?`): [`RunAsResult`](../interfaces/RunAsResult.md) \| `null`

Defined in: src/utils/runAsUser.ts:121

Become the configured run-as user, or refuse (#1693).

## Parameters

### env

`ProcessEnv`

the environment, after the `.env` files are applied

### dataDir

`string`

the instance data folder (FAST_STORAGE), re-owned when started as root

### slowDir

`string` \| `undefined`

SLOW_STORAGE, checked for writability after the switch when it exists

### ids?

[`ProcessIds`](../interfaces/ProcessIds.md) \| `null` = `...`

the process's id calls (defaults to the real process)

## Returns

[`RunAsResult`](../interfaces/RunAsResult.md) \| `null`

## Throws

when PUID/PGID are missing or invalid, when a non-root process is not
  PUID:PGID, or when SLOW_STORAGE is not writable as that user
