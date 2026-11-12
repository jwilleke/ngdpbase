[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/totpSeedCipher](../README.md) / openTotpSecret

# Function: openTotpSecret()

> __openTotpSecret__(`credentialsKey`, `username`, `sealed`): `string` \| `null`

Defined in: src/utils/totpSeedCipher.ts:31

Open a sealed value for `username`; null when it is malformed, for someone else, or under another key.

## Parameters

### credentialsKey

`string`

### username

`string`

### sealed

`string`

## Returns

`string` \| `null`
