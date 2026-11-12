[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedLookup](../README.md) / Resolver

# Type Alias: Resolver

> __Resolver__ = (`hostname`, `options`, `callback`) => `void`

Defined in: src/http/guardedLookup.ts:35

The resolution step, injectable.

Production passes `node:dns`'s `lookup`. Tests pass a stub, which is how the
plumbing is exercised without DNS or a socket — and deliberately the ONLY
seam: tier 1 in ./ssrf.ts is absolute, so no policy can open loopback to
reach a fixture server, and a production flag that could is precisely the
switch that gets left on. The seam is a parameter a caller must supply, not
a mode the shipped module can be put into.

## Parameters

### hostname

`string`

### options

#### all

`true`

### callback

(`err`, `addresses?`) => `void`

## Returns

`void`
