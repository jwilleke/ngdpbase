[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / MediaSkipReport

# Interface: MediaSkipReport

Defined in: src/utils/explainMediaPath.ts:84

The persisted skip report for the most recent scan (#1056).

`totalSkipped` is always exact; `skipped` may be capped, in which case
`truncated` is true. Reporting a shortened list as if it were complete is the
failure this shape exists to prevent — "0 excluded" while a directory-level
ignore quietly dropped a whole tree is what made the original counter
useless.

## Properties

### byMatched

> __byMatched__: `Record`\<`string`, `number`\>

Defined in: src/utils/explainMediaPath.ts:107

Exact count per matched value within a reason — extensions, ignored
directory names, ignore patterns. Answers "is my .orf being dropped?"
without needing the file to appear in the capped list at all.

Entries with no `matched` (dotfiles) are absent by construction.

***

### byReason

> __byReason__: `Partial`\<`Record`\<[`MediaSkipReason`](../type-aliases/MediaSkipReason.md), `number`\>\>

Defined in: src/utils/explainMediaPath.ts:99

Exact count per reason, never capped.

Measured on the reference library, the capped list alone would have been
close to useless: 14,746 skips, 14,714 of them `extension`, against a cap
of 1,000. The list gives examples; these counts give the shape, and the
shape is what tells an operator whether their file is one of 14,000
sidecars or the single odd case.

***

### scannedAt

> __scannedAt__: `string`

Defined in: src/utils/explainMediaPath.ts:87

ISO timestamp of the scan that produced it.

***

### skipped

> __skipped__: [`SkippedEntry`](SkippedEntry.md)[]

Defined in: src/utils/explainMediaPath.ts:108

***

### totalSkipped

> __totalSkipped__: `number`

Defined in: src/utils/explainMediaPath.ts:88

***

### truncated

> __truncated__: `boolean`

Defined in: src/utils/explainMediaPath.ts:89

***

### version

> __version__: `number`

Defined in: src/utils/explainMediaPath.ts:85
