[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / AuthResult

# Interface: AuthResult

Defined in: src/providers/BaseAuthProvider.ts:84

Returned by verify() on success.

## Extended by

- [`AgentTokenAuthResult`](../../AgentTokenAuthProvider/interfaces/AgentTokenAuthResult.md)
- [`OidcBearerAuthResult`](../../OidcBearerAuthProvider/interfaces/OidcBearerAuthResult.md)

## Properties

### aal?

> `optional` __aal?__: [`Aal`](../type-aliases/Aal.md)

Defined in: src/providers/BaseAuthProvider.ts:104

The assurance level a bearer credential's sign-in reached (#1576), when
it says. Roles above it step down for the request, as in a web session.
Absent on credentials that carry no sign-in (agent tokens).

***

### reported?

> `optional` __reported?__: [`ReportedAssurance`](ReportedAssurance.md)

Defined in: src/providers/BaseAuthProvider.ts:111

What an outside identity provider said about its own sign-in (#1633), set
only by outside sign-in providers. AuthManager reads it and decides what
it counts for; a provider never does.

***

### username

> __username__: `string`

Defined in: src/providers/BaseAuthProvider.ts:86

Username of the authenticated user

***

### viaToken?

> `optional` __viaToken?__: [`ViaToken`](ViaToken.md)

Defined in: src/providers/BaseAuthProvider.ts:97

Set by token-based providers (#946, #1048). Lets the caller enforce the
token's scope ceiling and stamp page provenance.

Declared here rather than read through a cast in AuthManager: the manager
always passed this field along, but `AuthResult` did not admit it existed,
so a provider that misspelled it or typed `scopes` wrongly still compiled
and silently delivered nothing.
