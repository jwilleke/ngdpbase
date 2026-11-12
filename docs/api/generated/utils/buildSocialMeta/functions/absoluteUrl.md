[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSocialMeta](../README.md) / absoluteUrl

# Function: absoluteUrl()

> __absoluteUrl__(`pathOrUrl`, `baseUrl`): `string` \| `undefined`

Defined in: src/utils/buildSocialMeta.ts:99

Resolve a possibly-relative URL against the base.

Returns undefined rather than a broken value when the base is unusable —
a relative `og:image` is ignored by every consumer, so emitting one is
worse than emitting none.

## Parameters

### pathOrUrl

`string`

### baseUrl

`string`

## Returns

`string` \| `undefined`
