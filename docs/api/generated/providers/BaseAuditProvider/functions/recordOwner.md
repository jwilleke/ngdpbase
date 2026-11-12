[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / recordOwner

# Function: recordOwner()

> __recordOwner__(`record`): `string` \| `null`

Defined in: src/providers/BaseAuditProvider.ts:204

The owner of the resource a record is about (#1537, #1825): `metadata.owner`,
where token, private-store and share records carry it today. Null when the
record names none.

## Parameters

### record

`Record`\<`string`, `unknown`\>

## Returns

`string` \| `null`
