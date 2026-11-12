[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditChain](../README.md) / ChainSegment

# Interface: ChainSegment

Defined in: src/utils/auditChain.ts:153

One contiguous chain within a log.

## Properties

### explained

> __explained__: `boolean`

Defined in: src/utils/auditChain.ts:160

True when a break at the END of this segment is followed by a restart marker.

***

### mismatchedPrevious

> __mismatchedPrevious__: `boolean`

Defined in: src/utils/auditChain.ts:162

True when this segment's marker names a previous head that does not match.

***

### restart?

> `optional` __restart?__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/auditChain.ts:158

The restart marker that begins this segment, if it was started by one.

***

### startIndex

> __startIndex__: `number`

Defined in: src/utils/auditChain.ts:155

Index of the segment's first record in the input.

***

### verdict

> __verdict__: [`ChainVerdict`](ChainVerdict.md)

Defined in: src/utils/auditChain.ts:156
