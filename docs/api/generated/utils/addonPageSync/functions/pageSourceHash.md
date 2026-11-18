[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / pageSourceHash

# Function: pageSourceHash()

> __pageSourceHash__(`content`): `string`

Defined in: src/utils/addonPageSync.ts:19

Stable content hash of an addon page body. Trimmed so a trailing-newline
difference between the source file and the on-disk form does not read as a
modification. This is the value stamped into a seeded page's
`addon-source-hash` frontmatter.

## Parameters

### content

`string`

## Returns

`string`
