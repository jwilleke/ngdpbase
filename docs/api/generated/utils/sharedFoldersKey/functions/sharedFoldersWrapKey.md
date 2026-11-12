[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFoldersKey](../README.md) / sharedFoldersWrapKey

# Function: sharedFoldersWrapKey()

> __sharedFoldersWrapKey__(`key`): `Buffer`

Defined in: src/utils/sharedFoldersKey.ts:35

The 32-byte key the folder keys are wrapped under, derived from the `.env`
value (HKDF-SHA256, one HMAC round: cheap, never a stall). Derived, not
decoded, so a value an operator set themselves in any form still works.

## Parameters

### key

`string`

## Returns

`Buffer`
