[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/TotpAuthProvider](../README.md) / TotpEnrolment

# Interface: TotpEnrolment

Defined in: src/providers/TotpAuthProvider.ts:44

A new seed, offered while enrolling and kept by the caller until it is confirmed.

## Properties

### seed

> __seed__: `string`

Defined in: src/providers/TotpAuthProvider.ts:46

Base32, for typing into the app by hand.

***

### uri

> __uri__: `string`

Defined in: src/providers/TotpAuthProvider.ts:48

The `otpauth://` URI the QR code carries.
