[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditChain](../README.md) / ChainStart

# Interface: ChainStart

Defined in: src/utils/auditChain.ts:90

Where a chain that does not begin at genesis begins (#1537): the sequence
and hash of the last record before the first one present. A retention
checkpoint holds exactly this for the records it removed, so what remains
verifies from it rather than from genesis.

## Properties

### hash

> __hash__: `string`

Defined in: src/utils/auditChain.ts:92

***

### seq

> __seq__: `number`

Defined in: src/utils/auditChain.ts:91
