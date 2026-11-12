[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parsePageSizeParam

# Function: parsePageSizeParam()

> __parsePageSizeParam__(`value`, `defaultSize?`): `number`

Defined in: src/utils/pluginFormatters.ts:544

Parse a `pageSize=` plugin parameter to an integer.
Returns `defaultSize` (0 = disabled / use max= behaviour) for missing/invalid values.

## Parameters

### value

`string` \| `number` \| `undefined`

### defaultSize?

`number` = `0`

## Returns

`number`
