[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configPaths](../README.md) / parsePathEntry

# Function: parsePathEntry()

> __parsePathEntry__(`entry`): `string`[] \| `null`

Defined in: src/utils/configPaths.ts:84

The segments of a path entry, or null when it is not a well-formed one: no
empty segment, and `*` only as a whole segment with at least two written-out
segments before the first one (`ngdpbase.<category>`), since a key is never
a wildcard.

## Parameters

### entry

`string`

## Returns

`string`[] \| `null`
