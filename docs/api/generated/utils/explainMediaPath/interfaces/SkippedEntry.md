[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / SkippedEntry

# Interface: SkippedEntry

Defined in: src/utils/explainMediaPath.ts:65

One file or directory the scanner passed over, and why.

## Properties

### isDirectory?

> `optional` __isDirectory?__: `boolean`

Defined in: src/utils/explainMediaPath.ts:70

True when `path` is a directory whose contents were never walked.

***

### matched?

> `optional` __matched?__: `string`

Defined in: src/utils/explainMediaPath.ts:72

The pattern or directory name that matched, when there was one.

***

### path

> __path__: `string`

Defined in: src/utils/explainMediaPath.ts:67

Absolute path. For a directory-level skip, the directory itself.

***

### reason

> __reason__: [`MediaSkipReason`](../type-aliases/MediaSkipReason.md)

Defined in: src/utils/explainMediaPath.ts:68
