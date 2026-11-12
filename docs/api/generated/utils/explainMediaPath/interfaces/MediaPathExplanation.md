[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/explainMediaPath](../README.md) / MediaPathExplanation

# Interface: MediaPathExplanation

Defined in: src/utils/explainMediaPath.ts:111

## Properties

### detail

> __detail__: `string`

Defined in: src/utils/explainMediaPath.ts:114

One sentence an operator can act on.

***

### itemId?

> `optional` __itemId?__: `string`

Defined in: src/utils/explainMediaPath.ts:116

Index id, when the path resolves to an item.

***

### matched?

> `optional` __matched?__: `string`

Defined in: src/utils/explainMediaPath.ts:120

For `ignore-dir` / `ignore-pattern`, what actually matched.

***

### primaryPath?

> `optional` __primaryPath?__: `string`

Defined in: src/utils/explainMediaPath.ts:118

For `alternate`, the primary item this file was folded into.

***

### verdict

> __verdict__: [`MediaPathVerdict`](../type-aliases/MediaPathVerdict.md)

Defined in: src/utils/explainMediaPath.ts:112
