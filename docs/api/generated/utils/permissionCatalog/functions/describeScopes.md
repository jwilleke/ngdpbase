[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/permissionCatalog](../README.md) / describeScopes

# Function: describeScopes()

> __describeScopes__(`names`, `definitions`): [`ScopeDescription`](../interfaces/ScopeDescription.md)[]

Defined in: src/utils/permissionCatalog.ts:118

Scope or permission names in plain words (#1764), in order, without
repeats: a sign-in scope by `SIGN_IN_SCOPE_LABELS`, a permission by
`permissionLabel` of its catalog entry. A name declared nowhere (an app's
own scope, such as a host's `patient/*.read`) is shown as itself.

## Parameters

### names

readonly `string`[]

### definitions

`unknown`

## Returns

[`ScopeDescription`](../interfaces/ScopeDescription.md)[]
