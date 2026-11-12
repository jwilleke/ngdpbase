[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / Assurance

# Interface: Assurance

Defined in: src/managers/AuthManager.ts:215

What a set of satisfied factors amounts to (#1523).

## Extended by

- [`SignInRecord`](SignInRecord.md)

## Properties

### aal

> __aal__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:218

***

### acr

> __acr__: [`PhishingResistance`](../../../providers/BaseAuthProvider/type-aliases/PhishingResistance.md) \| `"aal1"` \| `"aal2"` \| `"aal3"`

Defined in: src/managers/AuthManager.ts:220

What we claim, strongest first: `phrh`, `phr`, then the AAL. Never overstated.

***

### amr

> __amr__: `string`[]

Defined in: src/managers/AuthManager.ts:217

The combined RFC 8176 `amr` array.

***

### mfa

> __mfa__: `boolean`

Defined in: src/managers/AuthManager.ts:222

Two or more distinct factor types — what MFA means here, not two providers.
