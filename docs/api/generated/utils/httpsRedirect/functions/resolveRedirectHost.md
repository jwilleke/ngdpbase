[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / resolveRedirectHost

# Function: resolveRedirectHost()

> __resolveRedirectHost__(`hostHeader`, `configuredBaseUrl`): `string` \| `null`

Defined in: src/utils/httpsRedirect.ts:79

The host a redirect should point at.

An explicitly configured `ngdpbase.application.base-url` wins, because it is
the operator's own statement of what this instance is called and it cannot be
influenced by the request. The `Host` header is the fallback for the ordinary
case where no base URL is set, validated by [isSafeHost](isSafeHost.md).

The shipped default `http://localhost:3000` is NOT treated as configured —
`isBaseUrlExplicit()` exists for exactly this distinction (#642), and
redirecting every visitor to localhost would be worse than the handshake
error this replaces.

## Parameters

### hostHeader

`string` \| `undefined`

### configuredBaseUrl

`string` \| `null`

## Returns

`string` \| `null`
