[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvBackup](../README.md) / applyInstanceEnvAtStart

# Function: applyInstanceEnvAtStart()

> __applyInstanceEnvAtStart__(`instanceDataDir`, `siteFile`): [`EnvRestoreOutcome`](../interfaces/EnvRestoreOutcome.md) \| `null`

Defined in: src/utils/instanceEnvBackup.ts:131

Put a staged `.env` in place at the start of the process, when the whole
site restore is there to apply (`siteRestore.ts`). The live file is kept as
`.env.pre-restore`; the kept lines are carried over first. Null when there
is nothing to do.

## Parameters

### instanceDataDir

`string`

### siteFile

`string`

## Returns

[`EnvRestoreOutcome`](../interfaces/EnvRestoreOutcome.md) \| `null`
