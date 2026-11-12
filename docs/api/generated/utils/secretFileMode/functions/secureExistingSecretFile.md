[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/secretFileMode](../README.md) / secureExistingSecretFile

# Function: secureExistingSecretFile()

> __secureExistingSecretFile__(`file`): `string` \| `null`

Defined in: src/utils/secretFileMode.ts:34

Check an existing secret file at boot. Missing is fine (it is created
owner-only on first write). Returns a line to log when it was tightened.
Throws, naming both UIDs, when another account owns it.

## Parameters

### file

`string`

## Returns

`string` \| `null`
