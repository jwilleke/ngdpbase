[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/frontmatterAccess](../README.md) / FrontmatterDecision

# Interface: FrontmatterDecision

Defined in: src/utils/frontmatterAccess.ts:32

## Properties

### allowed

> __allowed__: `boolean`

Defined in: src/utils/frontmatterAccess.ts:36

Meaningful only when `decided`.

***

### decided

> __decided__: `boolean`

Defined in: src/utils/frontmatterAccess.ts:34

False when the page carries no rule for this action — caller falls through.

***

### matched?

> `optional` __matched?__: `string`

Defined in: src/utils/frontmatterAccess.ts:38

The principal that matched, for logging.
