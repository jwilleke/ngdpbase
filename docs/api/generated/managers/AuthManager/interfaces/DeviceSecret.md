[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / DeviceSecret

# Interface: DeviceSecret

Defined in: src/managers/AuthManager.ts:363

# 1523 slice 1c: a remembered browser's `device` row secret: its public key and what it was issued to.

## Extends

- [`BrowserIdentity`](../../../utils/browserDescription/interfaces/BrowserIdentity.md)

## Properties

### amr

> __amr__: `string`[]

Defined in: src/managers/AuthManager.ts:367

The `amr` of the sign-in that remembered it.

***

### auditId?

> `optional` __auditId?__: `string`

Defined in: src/managers/AuthManager.ts:380

The id of the audit record of the sign-in that remembered it (#1523,
operator 2026-10-31), and how that sign-in was made, as the record says.
A browser remembered before this has neither.

***

### browser

> __browser__: `string`

Defined in: src/utils/browserDescription.ts:39

#### Inherited from

[`BrowserIdentity`](../../../utils/browserDescription/interfaces/BrowserIdentity.md).[`browser`](../../../utils/browserDescription/interfaces/BrowserIdentity.md#browser)

***

### expiresAt

> __expiresAt__: `string`

Defined in: src/managers/AuthManager.ts:369

RFC 3339: after this it no longer skips the prompt.

***

### generation?

> `optional` __generation?__: `number`

Defined in: src/managers/AuthManager.ts:374

The account's password-change generation when it was remembered (#1482):
a later password change retires it.

***

### os

> __os__: `string`

Defined in: src/utils/browserDescription.ts:40

#### Inherited from

[`BrowserIdentity`](../../../utils/browserDescription/interfaces/BrowserIdentity.md).[`os`](../../../utils/browserDescription/interfaces/BrowserIdentity.md#os)

***

### platform

> __platform__: `string`

Defined in: src/utils/browserDescription.ts:42

The `Sec-CH-UA-Platform` hint, unquoted; empty when the browser sent none.

#### Inherited from

[`BrowserIdentity`](../../../utils/browserDescription/interfaces/BrowserIdentity.md).[`platform`](../../../utils/browserDescription/interfaces/BrowserIdentity.md#platform)

***

### publicKey

> __publicKey__: `string`

Defined in: src/managers/AuthManager.ts:365

The ECDSA P-256 public key, SPKI DER, base64url. Never a private key.

***

### signInMethod?

> `optional` __signInMethod?__: `string`

Defined in: src/managers/AuthManager.ts:381
