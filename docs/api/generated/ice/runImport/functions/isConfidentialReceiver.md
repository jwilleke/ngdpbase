[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / isConfidentialReceiver

# Function: isConfidentialReceiver()

> __isConfidentialReceiver__(`receiver`): `boolean`

Defined in: src/ice/runImport.ts:380

Is an import into this receiver confidential (#2110)? Only when its
destination is encrypted: a receiver that keeps into a sealed store
(`keepsEncrypted`), or whose own door writes into one (`writesEncrypted`,
# 2118). No receiver can declare itself so otherwise.

## Parameters

### receiver

`Pick`\<[`RegisteredReceiver`](../../types/interfaces/RegisteredReceiver.md), `"keepsEncrypted"` \| `"writesEncrypted"`\> \| `undefined`

## Returns

`boolean`
