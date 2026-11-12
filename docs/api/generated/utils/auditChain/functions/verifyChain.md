[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditChain](../README.md) / verifyChain

# Function: verifyChain()

> __verifyChain__(`records`, `options?`): [`ChainVerdict`](../interfaces/ChainVerdict.md)

Defined in: src/utils/auditChain.ts:106

Walk a chain in order and report the first break.

## Parameters

### records

readonly `Record`\<`string`, `unknown`\>[]

Audit records, oldest first

### options?

#### expectedHead?

`string`

Hash the last record must have. Supplying it is
  the only way to detect truncation: removing records from the end breaks no
  link, so the chain alone cannot see it.

#### start?

[`ChainStart`](../interfaces/ChainStart.md)

The checkpoint the chain continues from (#1537). The
  first record must then carry `start.seq + 1` and link to `start.hash`;
  without it the first record must link to genesis.

## Returns

[`ChainVerdict`](../interfaces/ChainVerdict.md)
