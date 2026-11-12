[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonProvenance](../README.md) / normaliseRepository

# Function: normaliseRepository()

> __normaliseRepository__(`value`): `string` \| `null`

Defined in: src/utils/addonProvenance.ts:42

`github.com/owner/repo` from any of `github.com/owner/repo`,
`https://github.com/owner/repo`, `git+https://github.com/owner/repo.git`.
Null when it is not host/owner/repo.

## Parameters

### value

`string`

## Returns

`string` \| `null`
