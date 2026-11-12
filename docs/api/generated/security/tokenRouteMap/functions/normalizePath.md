[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / normalizePath

# Function: normalizePath()

> __normalizePath__(`raw`): `string` \| `null`

Defined in: src/security/tokenRouteMap.ts:228

Reduce a request path to the form the map is written in, or refuse it.

Returns `null` for anything it cannot reduce confidently, and the caller
treats `null` as a refusal. That direction is deliberate: a normalizer that
guesses is worse than the check it replaces, because it produces a confident
allow from an input nobody understood. The issue's own warning is that a
sloppy matcher treating `/api/page/../admin/x` as in-scope would be worse
than no gate.

What it does:

- drops query and fragment (Express has already done this for `req.path`,
  but this function is also called directly by tests and must not depend on
  that);
- refuses an encoded separator (`%2f`, `%5c`) outright. There is no
  legitimate use in these routes and it is the classic way to smuggle a
  segment past a matcher;
- percent-decodes once, refusing on a malformed sequence;
- refuses any `.` or `..` segment rather than resolving it. Resolving is
  where traversal bugs live, and nothing legitimate sends one;
- collapses repeated slashes and drops a trailing slash, because Express
  routes `/api/tokens/` to `/api/tokens`;
- lowercases, because Express routing is case-insensitive by default and a
  case-sensitive matcher would let `/API/Tokens` through ungated while still
  reaching the handler.

## Parameters

### raw

`string`

## Returns

`string` \| `null`
