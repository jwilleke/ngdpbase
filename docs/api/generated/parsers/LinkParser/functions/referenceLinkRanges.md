[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/LinkParser](../README.md) / referenceLinkRanges

# Function: referenceLinkRanges()

> __referenceLinkRanges__(`content`): \[`number`, `number`\][]

Defined in: src/parsers/LinkParser.ts:116

Where the page's reference links are (#1491): each definition's `[label]`,
and each use of a defined label — `[text][label]` (no space between),
`[label][]` and `[label]`. markdown-it renders them and hides the
definitions; every other `[…]` stays a wiki link. A page that defines
nothing has no ranges, so it renders exactly as before.

## Parameters

### content

`string`

## Returns

\[`number`, `number`\][]
