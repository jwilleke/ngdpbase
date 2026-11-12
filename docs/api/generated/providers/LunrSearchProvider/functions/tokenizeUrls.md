[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/LunrSearchProvider](../README.md) / tokenizeUrls

# Function: tokenizeUrls()

> __tokenizeUrls__(`content`): `string`

Defined in: src/providers/LunrSearchProvider.ts:102

Split URLs found in page content into searchable word tokens (#884).

A URL indexed as one opaque string only ever matches if the reader types it
in full. Splitting on the separators that carry no meaning — `[/:._\-?&=#]`
— turns `https://en.wikipedia.org/wiki/Volcano` into `en wikipedia org wiki
volcano`, so the domain and the path words each become findable terms.

Deliberately conservative about what counts as a URL: only `http(s)://`
matches. Bare domains would drag in ordinary prose containing dots, and
abbreviations like "e.g." would tokenise into noise.

Numeric-only and single-character fragments are dropped — port numbers, path
ids and `v2`-style noise add index weight without ever being searched for.

## Parameters

### content

`string`

Page body

## Returns

`string`

Space-joined tokens, or '' when the page links nowhere
