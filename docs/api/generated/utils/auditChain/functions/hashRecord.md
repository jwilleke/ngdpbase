[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditChain](../README.md) / hashRecord

# Function: hashRecord()

> __hashRecord__(`record`, `seq`, `prevHash`): `string`

Defined in: src/utils/auditChain.ts:60

Hash a record in its position in the chain.

`seq` and `prevHash` are part of the input, not just the payload — otherwise
records could be reordered, or a record moved to a different predecessor,
without breaking anything.

## Parameters

### record

`Record`\<`string`, `unknown`\>

### seq

`number`

### prevHash

`string`

## Returns

`string`
