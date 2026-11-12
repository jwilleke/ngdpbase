[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcBearerAuthProvider](../README.md) / OidcBearerAuthResult

# Interface: OidcBearerAuthResult

Defined in: src/providers/OidcBearerAuthProvider.ts:19

Returned by verify() on success.

## Extends

- [`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md)

## Properties

### aal

> __aal__: `1` \| `2` \| `3`

Defined in: src/providers/OidcBearerAuthProvider.ts:21

The assurance level a bearer credential's sign-in reached (#1576), when
it says. Roles above it step down for the request, as in a web session.
Absent on credentials that carry no sign-in (agent tokens).

#### Overrides

[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md).[`aal`](../../BaseAuthProvider/interfaces/AuthResult.md#aal)

***

### reported?

> `optional` __reported?__: [`ReportedAssurance`](../../BaseAuthProvider/interfaces/ReportedAssurance.md)

Defined in: src/providers/BaseAuthProvider.ts:111

What an outside identity provider said about its own sign-in (#1633), set
only by outside sign-in providers. AuthManager reads it and decides what
it counts for; a provider never does.

#### Inherited from

[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md).[`reported`](../../BaseAuthProvider/interfaces/AuthResult.md#reported)

***

### username

> __username__: `string`

Defined in: src/providers/BaseAuthProvider.ts:86

Username of the authenticated user

#### Inherited from

[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md).[`username`](../../BaseAuthProvider/interfaces/AuthResult.md#username)

***

### viaToken

> __viaToken__: [`ViaToken`](../../BaseAuthProvider/interfaces/ViaToken.md)

Defined in: src/providers/OidcBearerAuthProvider.ts:20

Set by token-based providers (#946, #1048). Lets the caller enforce the
token's scope ceiling and stamp page provenance.

Declared here rather than read through a cast in AuthManager: the manager
always passed this field along, but `AuthResult` did not admit it existed,
so a provider that misspelled it or typed `scopes` wrongly still compiled
and silently delivered nothing.

#### Overrides

[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md).[`viaToken`](../../BaseAuthProvider/interfaces/AuthResult.md#viatoken)
