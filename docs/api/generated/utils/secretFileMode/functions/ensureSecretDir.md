[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/secretFileMode](../README.md) / ensureSecretDir

# Function: ensureSecretDir()

> __ensureSecretDir__(`dir`): `string` \| `null`

Defined in: src/utils/secretFileMode.ts:60

Make a directory holding secrets owner-only, creating it when absent.
Best effort on a filesystem that does not honour modes (an SMB share):
returns a warning instead of failing, since refusing to write a backup
over it would be worse than writing it with the share's permissions.

## Parameters

### dir

`string`

## Returns

`string` \| `null`
