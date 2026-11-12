[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / tokenGateDecision

# Function: tokenGateDecision()

> __tokenGateDecision__(`method`, `rawPath`, `scopes`, `map?`): [`GateDecision`](../interfaces/GateDecision.md)

Defined in: src/security/tokenRouteMap.ts:271

May a token holding `scopes` reach `method path`?

Call only for token-bearing requests. A session request has no token to cap
and must not be routed through this.

## Parameters

### method

`string`

### rawPath

`string`

### scopes

readonly `string`[]

### map?

readonly [`TokenRoute`](../interfaces/TokenRoute.md)[] = `TOKEN_ROUTE_MAP`

## Returns

[`GateDecision`](../interfaces/GateDecision.md)
