[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvBackup](../README.md) / mergeRestoredEnv

# Function: mergeRestoredEnv()

> __mergeRestoredEnv__(`restored`, `live`): `string`

Defined in: src/utils/instanceEnvBackup.ts:92

The file a restore puts in place: the backup's, without the kept names,
then the live file's lines for them (a name the live file does not set
stays unset).

## Parameters

### restored

`string`

### live

`string`

## Returns

`string`
