[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcAuthProvider](../README.md) / OidcIdentity

# Interface: OidcIdentity

Defined in: src/providers/OidcAuthProvider.ts:103

An outside identity, as the provider vouched for it.

## Properties

### email

> __email__: `string`

Defined in: src/providers/OidcAuthProvider.ts:107

The provider's email, only when it reports it verified; '' otherwise.

***

### reported

> __reported__: [`ReportedAssurance`](../../BaseAuthProvider/interfaces/ReportedAssurance.md)

Defined in: src/providers/OidcAuthProvider.ts:109

The ID token's `amr` and `acr`, as sent (#1633); AuthManager decides what they count for.

***

### subject

> __subject__: `string`

Defined in: src/providers/OidcAuthProvider.ts:105

`${iss}#${sub}`, with the configured issuer — the credentials-store subject.
