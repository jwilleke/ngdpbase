[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / ReportedAssurance

# Interface: ReportedAssurance

Defined in: src/providers/BaseAuthProvider.ts:120

An outside identity provider's `amr` and `acr` (#1633), exactly as its
verified ID token carried them: unchecked, so any type. AuthManager keeps
only well-formed values (`reportedValues`) and maps them to a level
(`outsideLevel`), counting them only for a provider the admin trusts.

## Properties

### acr?

> `optional` __acr?__: `unknown`

Defined in: src/providers/BaseAuthProvider.ts:122

***

### amr?

> `optional` __amr?__: `unknown`

Defined in: src/providers/BaseAuthProvider.ts:121
