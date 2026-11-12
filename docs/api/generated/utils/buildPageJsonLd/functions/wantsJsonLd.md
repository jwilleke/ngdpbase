[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildPageJsonLd](../README.md) / wantsJsonLd

# Function: wantsJsonLd()

> __wantsJsonLd__(`req`): `boolean`

Defined in: src/utils/buildPageJsonLd.ts:121

Slice 6b of #760 (#766) — content-negotiation gate. Returns true when
the client's `Accept` header signals it wants the JSON-LD representation
of a resource instead of the default (usually HTML).

Intentionally simple: a substring check for `application/ld+json`.
Quality values (`;q=0.9`), surrounding whitespace, and ordering relative
to other MIME types in the header are tolerated. We don't do strict
`Accept`-header parsing here — if a real client ever needs preference
resolution like "text/html;q=0.5, application/ld+json;q=1.0 → JSON-LD
wins", upgrade to a proper RFC 7231 parser. For now: if the header
mentions it, the client gets it.

## Parameters

### req

\{ `headers?`: \{ `accept?`: `string` \| `string`[]; \}; \} \| `null` \| `undefined`

## Returns

`boolean`
