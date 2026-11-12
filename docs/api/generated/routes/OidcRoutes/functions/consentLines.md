[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/OidcRoutes](../README.md) / consentLines

# Function: consentLines()

> __consentLines__(`scope`, `describe?`): `object`[]

Defined in: src/routes/OidcRoutes.ts:81

The scopes as consent lines, in request order, without repeats. `describe`
is the one lookup (#1764); a scope it does not know is shown by name.

## Parameters

### scope

`string`

### describe?

(`names`) => [`ScopeDescription`](../../../utils/permissionCatalog/interfaces/ScopeDescription.md)[]

## Returns

`object`[]
