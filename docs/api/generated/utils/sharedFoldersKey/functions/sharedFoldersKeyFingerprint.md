[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFoldersKey](../README.md) / sharedFoldersKeyFingerprint

# Function: sharedFoldersKeyFingerprint()

> __sharedFoldersKeyFingerprint__(`key`): `string`

Defined in: src/utils/sharedFoldersKey.ts:26

A short fingerprint of the shared-folders key: the first 16 hex digits of an
HMAC of a fixed label under the key, as for the backup key. Shown on Admin →
Backup and recorded with the wrapped folder keys, so a different key says so
plainly; it never reveals the key.

## Parameters

### key

`string`

## Returns

`string`
