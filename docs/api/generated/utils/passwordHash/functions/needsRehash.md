[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/passwordHash](../README.md) / needsRehash

# Function: needsRehash()

> __needsRehash__(`stored`): `boolean`

Defined in: src/utils/passwordHash.ts:146

Should this stored value be rewritten after a successful login?

True for legacy hashes, and for current-scheme hashes written under weaker
parameters than today's — which is how a future cost increase rolls out.
An empty hash is never rehashed; external accounts have no password.

## Parameters

### stored

`string`

## Returns

`boolean`
