[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/ownedRecords](../README.md) / OwnedRecordAsk

# Interface: OwnedRecordAsk

Defined in: src/security/ownedRecords.ts:23

One record, with the attributes the manager read from its stored row.

## Properties

### action

> __action__: `string`

Defined in: src/security/ownedRecords.ts:24

***

### resource

> __resource__: `object`

Defined in: src/security/ownedRecords.ts:25

#### attributes?

> `optional` __attributes?__: `Record`\<`string`, `unknown`\>

From the stored row. `owner`, when the type declares it, is the identity @id.

#### id

> __id__: `string`

#### type

> __type__: `string`
