[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/startupState](../README.md) / gateDecision

# Function: gateDecision()

> __gateDecision__(`engineReady`, `blocked`, `path`): [`GateDecision`](../type-aliases/GateDecision.md)

Defined in: src/utils/startupState.ts:63

What the initialisation gate should do with a request.

The server either is `engineReady` or it is not. What decides the third
behaviour is not a third readiness value but a second, independent fact:
whether the engine finished and a configuration value is unusable. Both are
passed in, so the impossible combination — ready AND blocked — simply never
arises at the call site rather than being modelled away.

## Parameters

### engineReady

`boolean`

### blocked

`boolean`

### path

`string`

## Returns

[`GateDecision`](../type-aliases/GateDecision.md)
