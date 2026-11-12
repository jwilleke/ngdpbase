[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / EgressPolicy

# Interface: EgressPolicy

Defined in: src/http/ssrf.ts:34

The operator-settable half of the boundary. Both lists hold IPv4 and IPv6 CIDRs.

## Properties

### allowedRanges

> __allowedRanges__: `string`[]

Defined in: src/http/ssrf.ts:38

Ranges permitted despite the defaults — e.g. a home instance opening its own LAN.

***

### deniedRanges

> __deniedRanges__: `string`[]

Defined in: src/http/ssrf.ts:36

Ranges refused in addition to the defaults.
