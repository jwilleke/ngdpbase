[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/AgentTokenAuthProvider](../README.md) / AgentTokenAuthResult

# Interface: AgentTokenAuthResult

Defined in: src/providers/AgentTokenAuthProvider.ts:37

Extra detail this provider returns alongside the username.

`viaToken` is optional on `AuthResult` (#1048) because most providers have
none; here it is REQUIRED. A successful agent-token verify without token
detail would be a credential with no scope ceiling attached, so narrowing it
is the point of this type rather than a formality.

## Extends

- [`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md)

## Properties

### aal?

> `optional` __aal?__: [`Aal`](../../BaseAuthProvider/type-aliases/Aal.md)

Defined in: src/providers/BaseAuthProvider.ts:104

The assurance level a bearer credential's sign-in reached (#1576), when
it says. Roles above it step down for the request, as in a web session.
Absent on credentials that carry no sign-in (agent tokens).

#### Inherited from

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

Defined in: src/providers/AgentTokenAuthProvider.ts:38

Set by token-based providers (#946, #1048). Lets the caller enforce the
token's scope ceiling and stamp page provenance.

Declared here rather than read through a cast in AuthManager: the manager
always passed this field along, but `AuthResult` did not admit it existed,
so a provider that misspelled it or typed `scopes` wrongly still compiled
and silently delivered nothing.

#### Overrides

[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md).[`viaToken`](../../BaseAuthProvider/interfaces/AuthResult.md#viatoken)
