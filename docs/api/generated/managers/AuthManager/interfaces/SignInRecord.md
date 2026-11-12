[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / SignInRecord

# Interface: SignInRecord

Defined in: src/managers/AuthManager.ts:899

How a session signed in (#1523): kept on the session so step-up (#1525) can
ask "was a factor satisfied within N minutes", the audit record can say how,
and UserInfo (#1529) can report `amr` / `acr` without overstating them.

## Extends

- [`Assurance`](Assurance.md)

## Properties

### aal

> __aal__: [`Aal`](../../../providers/BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/managers/AuthManager.ts:218

#### Inherited from

[`Assurance`](Assurance.md).[`aal`](Assurance.md#aal)

***

### acr

> __acr__: [`PhishingResistance`](../../../providers/BaseAuthProvider/type-aliases/PhishingResistance.md) \| `"aal1"` \| `"aal2"` \| `"aal3"`

Defined in: src/managers/AuthManager.ts:220

What we claim, strongest first: `phrh`, `phr`, then the AAL. Never overstated.

#### Inherited from

[`Assurance`](Assurance.md).[`acr`](Assurance.md#acr)

***

### amr

> __amr__: `string`[]

Defined in: src/managers/AuthManager.ts:217

The combined RFC 8176 `amr` array.

#### Inherited from

[`Assurance`](Assurance.md).[`amr`](Assurance.md#amr)

***

### at

> __at__: `string`

Defined in: src/managers/AuthManager.ts:905

When the sign-in completed, RFC 3339.

***

### factors

> __factors__: [`SatisfiedFactor`](SatisfiedFactor.md)[]

Defined in: src/managers/AuthManager.ts:901

***

### knownDevice?

> `optional` __knownDevice?__: `true`

Defined in: src/managers/AuthManager.ts:903

# 1523 slice 1c: the second-factor prompt was skipped on a remembered browser. It raises nothing.

***

### mfa

> __mfa__: `boolean`

Defined in: src/managers/AuthManager.ts:222

Two or more distinct factor types — what MFA means here, not two providers.

#### Inherited from

[`Assurance`](Assurance.md).[`mfa`](Assurance.md#mfa)

***

### provider

> __provider__: `string`

Defined in: src/managers/AuthManager.ts:900
