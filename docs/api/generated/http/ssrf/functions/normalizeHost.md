[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / normalizeHost

# Function: normalizeHost()

> __normalizeHost__(`hostname`): `string`

Defined in: src/http/ssrf.ts:93

The host as an address string, with the decorations URL parsing leaves on.

`new URL('http://[::1]/').hostname` is the string `"[::1]"`, and
`net.isIP('[::1]')` is 0 — so a literal-address check that skips the
brackets concludes "not an address" and lets every IPv6 literal through.
That was measured reaching a live local service.

## Parameters

### hostname

`string`

## Returns

`string`
