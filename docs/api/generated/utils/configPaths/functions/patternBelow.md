[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configPaths](../README.md) / patternBelow

# Function: patternBelow()

> __patternBelow__(`entry`, `key`): `string`[] \| `null`

Defined in: src/utils/configPaths.ts:98

Whether `entry` names something inside `key`'s value, and the path pattern
below the key if so. The key is matched literally: a `*` stands only for a
segment below it.

## Parameters

### entry

`string`

### key

`string`

## Returns

`string`[] \| `null`
