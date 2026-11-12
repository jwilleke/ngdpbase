[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / TokenRoute

# Interface: TokenRoute

Defined in: src/security/tokenRouteMap.ts:36

One reachable surface, and the scopes that reach it.

## Properties

### method

> __method__: `string`

Defined in: src/security/tokenRouteMap.ts:38

Uppercase HTTP method.

***

### note

> __note__: `string`

Defined in: src/security/tokenRouteMap.ts:56

Why this surface is reachable. Required, so an addition is a decision.

***

### pattern

> __pattern__: `string`

Defined in: src/security/tokenRouteMap.ts:45

Express-style path, `:param` matching exactly one non-empty segment.
Compared case-insensitively, because Express routes `/API/Tokens` to
`/api/tokens` by default — a case-sensitive matcher here would be a
bypass rather than a strictness.

***

### scopes

> __scopes__: `string`[]

Defined in: src/security/tokenRouteMap.ts:54

Scopes that grant reach. Holding ANY one is enough.

Any, not all, because this is a reach test rather than an authorization:
`POST /api/page/ingest` creates or updates depending on whether the page
exists, and the handler asks for the right one. Requiring both here would
refuse a legitimate create-only token before the handler could answer.
