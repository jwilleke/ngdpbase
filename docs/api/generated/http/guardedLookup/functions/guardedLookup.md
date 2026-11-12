[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedLookup](../README.md) / guardedLookup

# Function: guardedLookup()

> __guardedLookup__(`policy`, `resolver?`): (`hostname`, `options`, `callback?`) => `void`

Defined in: src/http/guardedLookup.ts:63

A `dns.lookup` that refuses to hand back an address the policy does not permit.

Pass as the `lookup` option to an `http.Agent` / `https.Agent`; Node then
calls it for every connection that agent opens.

Resolution is always requested with `all: true` regardless of what the
caller asked for, and EVERY returned address is judged. A name with several
A records must not pass on the strength of one public answer while another
points inward — that is round-robin SSRF, and checking only the first record
misses it entirely. The caller's requested shape is restored afterwards.

## Parameters

### policy

[`EgressPolicy`](../../ssrf/interfaces/EgressPolicy.md)

### resolver?

[`Resolver`](../type-aliases/Resolver.md) = `dnsLookup`

## Returns

(`hostname`, `options`, `callback?`) => `void`
