[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / isSafeHost

# Function: isSafeHost()

> __isSafeHost__(`host`): `host is string`

Defined in: src/utils/httpsRedirect.ts:57

A `host[:port]` that is safe to put in a `Location` header.

The `Host` header is written by the client, so echoing it into a redirect
unchecked is host-header injection: a request to this instance carrying
`Host: evil.example` would be answered with `Location: https://evil.example/`,
turning the instance into an open redirect that borrows its reputation.
Only the scheme is meant to change here, so anything that is not a bare
hostname and optional port is refused rather than sanitised — a rewritten
host is a guess about intent, and a 400 is not.

## Parameters

### host

`string` \| `undefined`

## Returns

`host is string`
