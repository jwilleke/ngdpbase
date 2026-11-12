[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/securityHeaders](../README.md) / newCspNonce

# Function: newCspNonce()

> __newCspNonce__(): `string`

Defined in: src/utils/securityHeaders.ts:86

A fresh nonce for one response's inline scripts (#1703): 128 random bits,
base64, as CSP's `'nonce-…'` source expects. Never reused: a nonce an
attacker can predict or replay is no nonce.

## Returns

`string`
