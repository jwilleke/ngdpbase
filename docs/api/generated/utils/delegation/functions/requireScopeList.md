[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/delegation](../README.md) / requireScopeList

# Function: requireScopeList()

> __requireScopeList__(`scopes`): `string`[]

Defined in: src/utils/delegation.ts:52

A delegation's permission list as given (#946, #1762): at least one, each a
non-empty string, de-duplicated in order. Throws a caller-safe message. One
rule for agent tokens and proxy grants.

## Parameters

### scopes

`unknown`

## Returns

`string`[]
