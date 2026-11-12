[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/LunrSearchProvider](../README.md) / applyPrefixToLastTerm

# Function: applyPrefixToLastTerm()

> __applyPrefixToLastTerm__(`query`): `string`

Defined in: src/providers/LunrSearchProvider.ts:67

Widen the last term of a query to a prefix match (#884).

Lunr's `*` wildcard, applied only to the final term: someone mid-word wants
completions, someone who submitted a finished query does not. Earlier terms
are words the user has already finished typing and stay exact.

Left alone when the last term already carries Lunr syntax — a wildcard, a
field scope (`title:x`), or a presence operator (`+`/`-`). Appending `*` to
those either duplicates an existing wildcard or corrupts the operator, and
silently mangling a query the caller wrote deliberately is worse than not
helping.

## Parameters

### query

`string`

Raw user query

## Returns

`string`

The query with its last term widened, or unchanged
