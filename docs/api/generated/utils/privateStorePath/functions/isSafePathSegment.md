[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / isSafePathSegment

# Function: isSafePathSegment()

> __isSafePathSegment__(`segment`): `boolean`

Defined in: src/utils/privateStorePath.ts:414

A user folder or file name is exactly one path segment. Usernames have no
enforced shape, so this refuses only what could leave the folder: empty,
`.`, `..`, a separator, or NUL.

## Parameters

### segment

`string`

## Returns

`boolean`
