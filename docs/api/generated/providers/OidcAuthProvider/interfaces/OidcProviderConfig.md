[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcAuthProvider](../README.md) / OidcProviderConfig

# Interface: OidcProviderConfig

Defined in: src/providers/OidcAuthProvider.ts:59

One configured provider, as AuthManager resolved it from configuration.

## Properties

### clientId

> __clientId__: `string`

Defined in: src/providers/OidcAuthProvider.ts:67

***

### clientSecret

> __clientSecret__: `string` \| [`SignedClientSecret`](SignedClientSecret.md)

Defined in: src/providers/OidcAuthProvider.ts:73

How the site proves itself at the token endpoint: a shared secret,
already resolved from its environment reference, or (Apple) a key it signs
a short-lived client secret with. Never logged.

***

### displayName

> __displayName__: `string`

Defined in: src/providers/OidcAuthProvider.ts:62

***

### emailVerifiedMayBeString?

> `optional` __emailVerifiedMayBeString?__: `boolean`

Defined in: src/providers/OidcAuthProvider.ts:86

The issuer may send `email_verified` as the string `"true"` / `"false"` (Apple); only true counts either way.

***

### icon

> __icon__: [`OutsideProviderIcon`](../type-aliases/OutsideProviderIcon.md)

Defined in: src/providers/OidcAuthProvider.ts:64

What its sign-in and Connect buttons show beside `displayName` (#1781).

***

### issuer

> __issuer__: `string`

Defined in: src/providers/OidcAuthProvider.ts:66

The issuer identifier, exactly as the issuer's discovery document states it.

***

### name

> __name__: `string`

Defined in: src/providers/OidcAuthProvider.ts:61

The entry's name; the provider's id is `oidc:<name>`, its URLs `/auth/oauth/<name>`.

***

### policy

> __policy__: [`EgressPolicy`](../../../http/ssrf/interfaces/EgressPolicy.md)

Defined in: src/providers/OidcAuthProvider.ts:77

Where outbound requests may go (ngdpbase.security.egress.*).

***

### redirectUri

> __redirectUri__: `string`

Defined in: src/providers/OidcAuthProvider.ts:75

This site's callback, registered with the provider.

***

### responseMode?

> `optional` __responseMode?__: `"form_post"`

Defined in: src/providers/OidcAuthProvider.ts:84

`form_post`: the issuer POSTs the code and state back (Apple, whenever
scopes are asked for). AuthManager answers `callbackIsPosted` from it, and
the relay in `middleware/outsideCallbackRelay.ts` turns the POST into the
usual GET callback.
