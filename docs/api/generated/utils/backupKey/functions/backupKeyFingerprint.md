[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupKey](../README.md) / backupKeyFingerprint

# Function: backupKeyFingerprint()

> __backupKeyFingerprint__(`key`): `string`

Defined in: src/utils/backupKey.ts:22

A short fingerprint of a backup key (#1723, D3): the first 16 hex digits of
an HMAC of a fixed label under the key. Recorded in each backup so a restore
under another key says so plainly; it never reveals the key.

## Parameters

### key

`string`

## Returns

`string`
