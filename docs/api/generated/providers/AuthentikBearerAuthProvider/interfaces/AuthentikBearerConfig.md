[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/AuthentikBearerAuthProvider](../README.md) / AuthentikBearerConfig

# Interface: AuthentikBearerConfig

Defined in: src/providers/AuthentikBearerAuthProvider.ts:54

## Properties

### audience

> __audience__: `string`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:60

Expected audience (the Authentik provider's client-id).

***

### defaultRole

> __defaultRole__: `string`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:62

Role assigned to JIT-provisioned users when no group maps.

***

### groupMap

> __groupMap__: `Record`\<`string`, `string`\>

Defined in: src/providers/AuthentikBearerAuthProvider.ts:67

Map of Authentik group name → ngdpbase role name. Groups absent from this
map are silently ignored (user still gets defaultRole).

***

### issuer

> __issuer__: `string`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:56

OIDC issuer, e.g. `https://auth.example.com/application/o/ngdpbase/`.

***

### jwksUrl

> __jwksUrl__: `string`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:58

JWKS URI, e.g. `<issuer>jwks/`.
