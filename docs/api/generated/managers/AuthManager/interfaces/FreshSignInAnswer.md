[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / FreshSignInAnswer

# Interface: FreshSignInAnswer

Defined in: src/managers/AuthManager.ts:1056

The step-up answer (#1525, #1635), for the caller to send in its own form.

## Properties

### delegated

> __delegated__: `boolean`

Defined in: src/managers/AuthManager.ts:1060

An agent token or share link: it can never give a fresh sign-in, so there is no `reauth`.

***

### error

> __error__: `string`

Defined in: src/managers/AuthManager.ts:1062

What to tell the person.

***

### permission

> __permission__: `string`

Defined in: src/managers/AuthManager.ts:1058

The refused permission.

***

### reauth?

> `optional` __reauth?__: `string`

Defined in: src/managers/AuthManager.ts:1064

Where to re-authenticate, returning to the page they were on. Absent for a delegated credential.
