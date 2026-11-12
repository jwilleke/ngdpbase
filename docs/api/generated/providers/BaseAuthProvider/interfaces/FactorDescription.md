[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / FactorDescription

# Interface: FactorDescription

Defined in: src/providers/BaseAuthProvider.ts:142

What a provider gives as a sign-in factor, declared in its code (#1523).

Configuration (`ngdpbase.auth.factors`) may lower these, never raise them:
the code is the ceiling because the code is what actually checks the
credential. Know / have / are and device-boundness are derived from `amr`,
so there is one source for them.

## Properties

### aal

> __aal__: [`Aal`](../type-aliases/Aal.md)

Defined in: src/providers/BaseAuthProvider.ts:145

***

### acr?

> `optional` __acr?__: [`PhishingResistance`](../type-aliases/PhishingResistance.md)

Defined in: src/providers/BaseAuthProvider.ts:146

***

### amr

> __amr__: `string`[]

Defined in: src/providers/BaseAuthProvider.ts:144

RFC 8176 `amr` values, plus the unregistered `email` and `push`.

***

### primary

> __primary__: `boolean`

Defined in: src/providers/BaseAuthProvider.ts:148

Can start a sign-in, rather than only follow one as an additional factor.
