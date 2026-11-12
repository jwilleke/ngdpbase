[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / sameUsername

# Function: sameUsername()

> __sameUsername__(`a`, `b`): `boolean`

Defined in: src/utils/username.ts:47

True when two usernames name the same account.

Exists so a comparison reads as the question it is asking, and so no call
site re-implements the rule by hand — which is how the spellings diverged.

## Parameters

### a

`unknown`

### b

`unknown`

## Returns

`boolean`
