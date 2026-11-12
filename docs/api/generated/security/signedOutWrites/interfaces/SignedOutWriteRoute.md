[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/signedOutWrites](../README.md) / SignedOutWriteRoute

# Interface: SignedOutWriteRoute

Defined in: src/security/signedOutWrites.ts:32

## Properties

### method

> __method__: [`WriteMethod`](../type-aliases/WriteMethod.md)

Defined in: src/security/signedOutWrites.ts:33

***

### path

> __path__: `string`

Defined in: src/security/signedOutWrites.ts:35

An Express path: literal segments and `:name` parameters only.

***

### reason

> __reason__: `string`

Defined in: src/security/signedOutWrites.ts:37

Why a caller who is not signed in must reach it. Required.
