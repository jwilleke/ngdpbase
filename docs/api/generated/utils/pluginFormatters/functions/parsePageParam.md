[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parsePageParam

# Function: parsePageParam()

> __parsePageParam__(`value`, `defaultPage?`): `number`

Defined in: src/utils/pluginFormatters.ts:534

Parse a `page=` plugin parameter to an integer (1-based).
Returns `defaultPage` if the value is missing, empty, or non-numeric.

## Parameters

### value

`string` \| `number` \| `undefined`

### defaultPage?

`number` = `1`

## Returns

`number`
