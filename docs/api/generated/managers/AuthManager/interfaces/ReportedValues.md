[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / ReportedValues

# Interface: ReportedValues

Defined in: src/managers/AuthManager.ts:270

An outside provider's report, as kept (#1633): only well-formed values,
bounded, and whether the admin trusts this provider's own second factor.
Recorded in the sign-in's audit record whether or not it counts.

## Properties

### acr?

> `optional` __acr?__: `string`

Defined in: src/managers/AuthManager.ts:272

***

### amr

> __amr__: `string`[]

Defined in: src/managers/AuthManager.ts:271

***

### trusted

> __trusted__: `boolean`

Defined in: src/managers/AuthManager.ts:273
