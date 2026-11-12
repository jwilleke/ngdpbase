[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/startupState](../README.md) / initialisationGate

# Function: initialisationGate()

> __initialisationGate__(`engineReady`, `maintenance`, `path`): [`GateDecision`](../type-aliases/GateDecision.md)

Defined in: src/utils/startupState.ts:91

The initialisation gate's decision with maintenance mode in it (#1906).

A failure a manager entered (`engine.maintenance.enter`) keeps everyone,
administrators included, to the repair screens — before the engine is ready
and after. It is asked per request, so when that reason leaves, the site
reopens without a restart. The admin switch is not a failure and does not
close this gate: the maintenance gate behind the session handles it, where
an administrator can be recognised.

## Parameters

### engineReady

`boolean`

### maintenance

\{ `isClosedToAdmins`(): `boolean`; \} \| `null` \| `undefined`

### path

`string`

## Returns

[`GateDecision`](../type-aliases/GateDecision.md)
