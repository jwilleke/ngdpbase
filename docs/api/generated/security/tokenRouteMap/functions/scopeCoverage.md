[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / scopeCoverage

# Function: scopeCoverage()

> __scopeCoverage__(`mintableScopes`, `map?`, `unreachable?`): `object`

Defined in: src/security/tokenRouteMap.ts:157

Every mintable scope, split into reachable and deliberately-not.

Takes the permission list rather than reading `UserManager`, so the check is
a pure function its test can drive with a known set.

## Parameters

### mintableScopes

readonly `string`[]

### map?

readonly [`TokenRoute`](../interfaces/TokenRoute.md)[] = `TOKEN_ROUTE_MAP`

### unreachable?

`Record`\<`string`, `string`\> = `UNREACHABLE_SCOPES`

## Returns

`object`

### declaredUnreachable

> __declaredUnreachable__: `string`[]

### reachable

> __reachable__: `string`[]

### undecided

> __undecided__: `string`[]
