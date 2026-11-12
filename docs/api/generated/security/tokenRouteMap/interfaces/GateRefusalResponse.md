[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / GateRefusalResponse

# Interface: GateRefusalResponse

Defined in: src/security/tokenRouteMap.ts:312

The 403 body a refused token receives.

## Properties

### error

> __error__: `"Forbidden"`

Defined in: src/security/tokenRouteMap.ts:314

***

### message

> __message__: `string`

Defined in: src/security/tokenRouteMap.ts:321

***

### reason

> __reason__: [`GateRefusal`](../type-aliases/GateRefusal.md)

Defined in: src/security/tokenRouteMap.ts:320

Which refusal, so an agent author can tell "I lack the scope" from "this
surface is not open to tokens at all". Different fixes; guessing between
them wastes a support cycle.

***

### success

> __success__: `false`

Defined in: src/security/tokenRouteMap.ts:313
