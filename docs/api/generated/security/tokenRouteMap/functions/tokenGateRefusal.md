[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / tokenGateRefusal

# Function: tokenGateRefusal()

> __tokenGateRefusal__(`method`, `path`, `scopes`, `map?`): [`GateRefusalResponse`](../interfaces/GateRefusalResponse.md) \| `null`

Defined in: src/security/tokenRouteMap.ts:337

The gate as the bearer middleware applies it: the refusal to send, or `null`
to proceed.

Exported so `app.ts` and the wiring test call the SAME code rather than a
test reproducing the middleware's logic beside it. A reproduced guard passes
its tests forever while the original drifts, which is the failure this whole
issue is about.

Pass `scopes` only for a token-bearing request. A session has no token to
cap, and the caller must not enter this at all — that placement is what
makes browsers unaffected by construction.

## Parameters

### method

`string`

### path

`string`

### scopes

readonly `string`[]

### map?

readonly [`TokenRoute`](../interfaces/TokenRoute.md)[] = `TOKEN_ROUTE_MAP`

## Returns

[`GateRefusalResponse`](../interfaces/GateRefusalResponse.md) \| `null`
