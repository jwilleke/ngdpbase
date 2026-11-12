[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / isBlockedHostname

# Function: isBlockedHostname()

> __isBlockedHostname__(`host`): `boolean`

Defined in: src/http/ssrf.ts:108

Names that never leave the machine, refused before any resolution.

The suffixes are the ones mDNS, container runtimes and cloud providers use
for names that are internal by definition.

## Parameters

### host

`string`

## Returns

`boolean`
