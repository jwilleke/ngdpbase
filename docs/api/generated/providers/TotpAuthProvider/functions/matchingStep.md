[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/TotpAuthProvider](../README.md) / matchingStep

# Function: matchingStep()

> __matchingStep__(`seed`, `code`, `now`): `number` \| `null`

Defined in: src/providers/TotpAuthProvider.ts:67

The time step `code` belongs to within the drift window, or null. Pure; the
caller decides about replay.

## Parameters

### seed

`string`

### code

`string`

### now

`number`

## Returns

`number` \| `null`
