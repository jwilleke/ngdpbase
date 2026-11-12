[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/totpSeedCipher](../README.md) / sealTotpSecret

# Function: sealTotpSecret()

> __sealTotpSecret__(`credentialsKey`, `username`, `plain`): `string`

Defined in: src/utils/totpSeedCipher.ts:22

Seal `plain` for `username`; returns `v1.<iv>.<ciphertext+tag>`, base64url.

## Parameters

### credentialsKey

`string`

### username

`string`

### plain

`string`

## Returns

`string`
