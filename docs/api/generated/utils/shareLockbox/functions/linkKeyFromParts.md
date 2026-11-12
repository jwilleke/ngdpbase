[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/shareLockbox](../README.md) / linkKeyFromParts

# Function: linkKeyFromParts()

> __linkKeyFromParts__(`jwk`): `string`

Defined in: src/utils/shareLockbox.ts:98

The key part of a link, `{d}.{x}.{y}` in base64url: the private key the
owner's browser made. The server never holds one; this is for the tests,
and mirrors what the viewer does.

## Parameters

### jwk

#### d

`string`

#### x

`string`

#### y

`string`

## Returns

`string`
