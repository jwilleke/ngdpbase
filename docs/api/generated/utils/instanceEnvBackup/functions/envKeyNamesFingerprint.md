[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/instanceEnvBackup](../README.md) / envKeyNamesFingerprint

# Function: envKeyNamesFingerprint()

> __envKeyNamesFingerprint__(`names`): `string`

Defined in: src/utils/instanceEnvBackup.ts:68

A short fingerprint of a set of `.env` names (#1976): the first 16 hex digits of a SHA-256 of the sorted names, one per line.

## Parameters

### names

readonly `string`[]

## Returns

`string`
