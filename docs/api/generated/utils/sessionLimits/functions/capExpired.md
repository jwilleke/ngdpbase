[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionLimits](../README.md) / capExpired

# Function: capExpired()

> __capExpired__(`signedInAt`, `now`, `capMs`): `boolean`

Defined in: src/utils/sessionLimits.ts:61

Whether a session signed in at `signedInAt` (epoch ms) is past the cap. No recorded time is not expired.

## Parameters

### signedInAt

`unknown`

### now

`number`

### capMs

`number`

## Returns

`boolean`
