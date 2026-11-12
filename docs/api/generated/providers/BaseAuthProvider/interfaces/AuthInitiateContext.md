[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / AuthInitiateContext

# Interface: AuthInitiateContext

Defined in: src/providers/BaseAuthProvider.ts:22

Context passed to initiate() for challenge-based auth flows.

Note: providers that emit absolute URLs (magic-link verify links,
OAuth callbacks) read the canonical base URL from ConfigurationManager
at runtime — callers don't pass it in (#642 Iteration 3).

## Properties

### connectFor?

> `optional` __connectFor?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:38

# 1743: the signed-in account an outside identity is being connected to.
Absent for a sign-in. A flow started to connect never signs anyone in,
and a sign-in flow never connects.

***

### deviceState?

> `optional` __deviceState?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:32

# 1022: opaque per-request value identifying the browser that asked for the
link, mirrored into an HTTP-only cookie. Stored with the token so the
redeeming browser can be compared against the requesting one.

***

### email?

> `optional` __email?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:24

Email address (magic link)

***

### redirect?

> `optional` __redirect?__: `string`

Defined in: src/providers/BaseAuthProvider.ts:26

URL to redirect to after successful authentication
