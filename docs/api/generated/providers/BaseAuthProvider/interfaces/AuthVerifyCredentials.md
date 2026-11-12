[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / AuthVerifyCredentials

# Interface: AuthVerifyCredentials

Defined in: src/providers/BaseAuthProvider.ts:44

Credentials passed to verify(). Fields used depend on the provider.

## Properties

### account?

> `optional` __account?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:54

The account chosen for a link to a shared address (#2073) — used by MagicLinkAuthProvider.

***

### code?

> `optional` __code?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:52

A six-digit authenticator-app code — used by TotpAuthProvider (#421).

***

### deviceState?

> `optional` __deviceState?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:58

The browser-binding value from the caller's cookie (#1022 magic link, #1630 OAuth)

***

### password?

> `optional` __password?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:48

Password — used by PasswordAuthProvider

***

### state?

> `optional` __state?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:56

OAuth `state` from the callback — used by OidcAuthProvider

***

### token?

> `optional` __token?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:50

One-time token — used by MagicLinkAuthProvider

***

### username?

> `optional` __username?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:46

Username — used by PasswordAuthProvider

***

### webauthn?

> `optional` __webauthn?__: `object`

Defined in: src/providers/BaseAuthProvider.ts:60

A WebAuthn assertion and the single-use challenge it must answer — used by PasskeyAuthProvider (#448).

#### expectedChallenge

> __expectedChallenge__: `string`

#### response

> __response__: `unknown`
