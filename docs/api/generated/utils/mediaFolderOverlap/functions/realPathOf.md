[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/mediaFolderOverlap](../README.md) / realPathOf

# Function: realPathOf()

> __realPathOf__(`p`): `string`

Defined in: src/utils/mediaFolderOverlap.ts:83

The real path of `p`, or of its nearest existing ancestor with the rest
appended. `p` is not normalized first: `link/..` is the parent of where
`link` points, not the directory holding `link` (#2195).

## Parameters

### p

`string`

## Returns

`string`
