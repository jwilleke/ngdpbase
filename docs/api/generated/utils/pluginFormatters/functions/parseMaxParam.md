[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parseMaxParam

# Function: parseMaxParam()

> __parseMaxParam__(`value`, `defaultMax?`): `number`

Defined in: src/utils/pluginFormatters.ts:55

Parse a `max` plugin parameter to an integer.
Returns `defaultMax` if the value is missing, empty, or non-numeric.
A value of 0 means unlimited.

## Parameters

### value

`string` \| `number` \| `undefined`

### defaultMax?

`number` = `0`

## Returns

`number`
