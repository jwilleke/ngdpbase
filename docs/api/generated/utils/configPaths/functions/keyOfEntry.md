[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configPaths](../README.md) / keyOfEntry

# Function: keyOfEntry()

> __keyOfEntry__(`entry`, `has`): `string` \| `null`

Defined in: src/utils/configPaths.ts:127

The configuration key a path entry lies inside: the longest prefix, ending
before the first `*`, for which `has` is true. Null when none is set.

## Parameters

### entry

`string`

### has

(`key`) => `boolean`

## Returns

`string` \| `null`
