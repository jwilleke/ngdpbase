[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildKeywordPool](../README.md) / KEYWORD\_POOL\_SKIP

# Variable: KEYWORD\_POOL\_SKIP

> `const` __KEYWORD\_POOL\_SKIP__: `string`[]

Defined in: src/utils/buildKeywordPool.ts:24

Buckets that are not free-text keywords. Excluded from SUGGESTIONS only —
typing one anyway is self-correcting, since save-time normalization (#893)
migrates it to the right bucket.
