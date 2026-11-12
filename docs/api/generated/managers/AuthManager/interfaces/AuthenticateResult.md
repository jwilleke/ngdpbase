[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / AuthenticateResult

# Interface: AuthenticateResult

Defined in: src/managers/AuthManager.ts:1099

## Properties

### aal?

> `optional` __aal?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:1118

# 1576: the sign-in level a bearer credential carries; roles above it step down.

***

### factors?

> `optional` __factors?__: [`SatisfiedFactor`](SatisfiedFactor.md)[]

Defined in: src/managers/AuthManager.ts:1105

The factors satisfied, each with its time; empty for a delegated credential (#1523).

***

### knownDevice?

> `optional` __knownDevice?__: `boolean`

Defined in: src/managers/AuthManager.ts:1125

# 1523 slice 1c: the second-factor prompt was skipped because this browser
is remembered. Not a factor: `factors` holds only what was entered.

***

### provider?

> `optional` __provider?__: `string`

Defined in: src/managers/AuthManager.ts:1103

The provider that verified this sign-in (#1523).

***

### reported?

> `optional` __reported?__: [`ReportedValues`](ReportedValues.md)

Defined in: src/managers/AuthManager.ts:1120

# 1633: what an outside provider reported about its own sign-in, for the audit record.

***

### success

> __success__: `boolean`

Defined in: src/managers/AuthManager.ts:1100

***

### username?

> `optional` __username?__: `string`

Defined in: src/managers/AuthManager.ts:1101

***

### viaToken?

> `optional` __viaToken?__: [`ViaToken`](../../../providers/BaseAuthProvider/interfaces/ViaToken.md)

Defined in: src/managers/AuthManager.ts:1116

# 946 — set by token-based providers. Carries the delegating token's
identity and scopes so the caller can enforce the scope ceiling and stamp
page provenance.

# 1048: references the same `ViaToken` the provider contract declares,
rather than repeating the shape. The two ends of one value used to be
written out twice, which is how they drifted far enough apart to need a
cast between them.
