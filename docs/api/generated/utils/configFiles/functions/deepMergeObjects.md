[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/configFiles](../README.md) / deepMergeObjects

# Function: deepMergeObjects()

> __deepMergeObjects__(`defaultObj`, `customObj`): `Record`\<`string`, `unknown`\>

Defined in: src/utils/configFiles.ts:153

Deep merge, custom over default.

- plain objects: recursively, key by key
- arrays: [mergeArrays](mergeArrays.md)
- an array of names onto a set map: the names are added (#1612)
- `null`: an explicit removal — the custom file cannot express a deletion any other way
- `undefined`: skipped
- anything else: custom wins

## Parameters

### defaultObj

`Record`\<`string`, `unknown`\>

### customObj

`Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `unknown`\>
