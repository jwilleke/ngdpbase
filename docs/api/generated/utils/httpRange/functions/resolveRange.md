[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpRange](../README.md) / resolveRange

# Function: resolveRange()

> __resolveRange__(`rangeHeader`, `size`): [`ResolvedRange`](../type-aliases/ResolvedRange.md)

Defined in: src/utils/httpRange.ts:73

Resolve a `Range` request header against a known entity size.

## Parameters

### rangeHeader

`string` \| `undefined`

Raw header value, or `undefined` when none was sent.

### size

`number`

Entity size in bytes. A non-finite or negative size yields
  `none`, so a bad `stat` degrades to serving the whole file rather than
  inventing an offset.

## Returns

[`ResolvedRange`](../type-aliases/ResolvedRange.md)

Which of the three responses the caller should make.
