[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/DatabaseAuditProvider](../README.md) / readAuditChain

# Function: readAuditChain()

> __readAuditChain__(`db`): `object`

Defined in: src/providers/DatabaseAuditProvider.ts:115

What verification reads (#1537): the newest checkpoint, and every record
after it in the order written. Used by the provider and by
`scripts/verify-audit-chain.ts`, which opens the database read-only
without booting the application.

## Parameters

### db

`Database`

## Returns

`object`

### records

> __records__: `Record`\<`string`, `unknown`\>[]

### start

> __start__: [`ChainStart`](../../../utils/auditChain/interfaces/ChainStart.md) \| `null`
