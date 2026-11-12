[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedFetch](../README.md) / Transport

# Type Alias: Transport

> __Transport__ = (`url`, `init`) => `Promise`\<[`TransportResponse`](../interfaces/TransportResponse.md)\>

Defined in: src/http/guardedFetch.ts:57

One request, one response, no redirect handling.

Injected so the redirect and limit logic can be tested without a socket.
Tier 1 in ./ssrf.ts is absolute, so a test cannot open loopback to reach a
fixture server — and a production flag that could is precisely the switch
that gets left on. The seam is a parameter a caller supplies, never a mode
the shipped module can be put into.

## Parameters

### url

`URL`

### init

[`TransportInit`](../interfaces/TransportInit.md)

## Returns

`Promise`\<[`TransportResponse`](../interfaces/TransportResponse.md)\>
