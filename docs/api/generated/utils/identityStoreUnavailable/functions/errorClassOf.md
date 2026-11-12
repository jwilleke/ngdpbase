[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/identityStoreUnavailable](../README.md) / errorClassOf

# Function: errorClassOf()

> __errorClassOf__(`error`): `string`

Defined in: src/utils/identityStoreUnavailable.ts:23

How a failure is named in a counts-only report: its error code (`EACCES`,
`ENOSPC`) or class name, never its message (which may hold a path or a
name).

## Parameters

### error

`unknown`

## Returns

`string`
