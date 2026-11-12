[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcAuthProvider](../README.md) / SignedClientSecret

# Interface: SignedClientSecret

Defined in: src/providers/OidcAuthProvider.ts:95

Apple's client secret is not a shared secret but a JWT the site signs
(ES256) with a key from its Apple developer account: `kid` the key's id,
`iss` the team id, `sub` the client id, `aud` the issuer, and an expiry
of at most six months. Signed afresh for each code exchange, valid 5 minutes.

## Properties

### keyId

> __keyId__: `string`

Defined in: src/providers/OidcAuthProvider.ts:97

***

### privateKey

> __privateKey__: `KeyObject`

Defined in: src/providers/OidcAuthProvider.ts:99

The EC P-256 private key (Apple's `.p8`), checked by AuthManager when it registers the provider.

***

### teamId

> __teamId__: `string`

Defined in: src/providers/OidcAuthProvider.ts:96
