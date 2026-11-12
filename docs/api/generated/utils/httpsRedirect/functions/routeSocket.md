[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / routeSocket

# Function: routeSocket()

> __routeSocket__(`socket`, `deps`): `void`

Defined in: src/utils/httpsRedirect.ts:213

Route one accepted socket to either the TLS server or the redirect server.

Exported for its own test: this is the function that can break HTTPS if it is
wrong, so it is tested directly rather than only through a live server.

## Parameters

### socket

`Socket`

### deps

[`MultiplexDeps`](../interfaces/MultiplexDeps.md)

## Returns

`void`
