[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / FactorEntry

# Interface: FactorEntry

Defined in: src/managers/AuthManager.ts:120

One entry of `ngdpbase.auth.factors`, as written in configuration (#1523).

## Properties

### aal?

> `optional` __aal?__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:124

***

### acr?

> `optional` __acr?__: [`PhishingResistance`](../../../providers/BaseAuthProvider/type-aliases/PhishingResistance.md)

Defined in: src/managers/AuthManager.ts:125

***

### amr?

> `optional` __amr?__: `string`[]

Defined in: src/managers/AuthManager.ts:123

***

### authproviderid

> __authproviderid__: `string`

Defined in: src/managers/AuthManager.ts:121

***

### enabled?

> `optional` __enabled?__: `boolean`

Defined in: src/managers/AuthManager.ts:126

***

### preference?

> `optional` __preference?__: `number`

Defined in: src/managers/AuthManager.ts:132

Where it comes among the second factors offered, lower first; none comes
last (#1523, operator 2026-10-11). A number, because the configuration
merge does not keep a custom entry's place in the list.

***

### primary?

> `optional` __primary?__: `boolean`

Defined in: src/managers/AuthManager.ts:122
