[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / SatisfiedFactor

# Interface: SatisfiedFactor

Defined in: src/managers/AuthManager.ts:207

A factor a sign-in satisfied, and when — what step-up asks about (#1525).

## Extends

- `Omit`\<[`Factor`](Factor.md), `"primary"`\>

## Properties

### aal

> __aal__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:202

#### Inherited from

[`Factor`](Factor.md).[`aal`](Factor.md#aal)

***

### acr?

> `optional` __acr?__: [`PhishingResistance`](../../../providers/BaseAuthProvider/type-aliases/PhishingResistance.md)

Defined in: src/managers/AuthManager.ts:203

#### Inherited from

[`Factor`](Factor.md).[`acr`](Factor.md#acr)

***

### amr

> __amr__: `string`[]

Defined in: src/managers/AuthManager.ts:201

#### Inherited from

[`Factor`](Factor.md).[`amr`](Factor.md#amr)

***

### at

> __at__: `string`

Defined in: src/managers/AuthManager.ts:208

***

### provider

> __provider__: `string`

Defined in: src/managers/AuthManager.ts:199

#### Inherited from

[`Factor`](Factor.md).[`provider`](Factor.md#provider)
