[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / recordOwnerUser

# Function: recordOwnerUser()

> __recordOwnerUser__(`record`): `string` \| `null`

Defined in: src/providers/BaseAuditProvider.ts:215

The username of the owner of the resource a record is about (#2041):
`metadata.ownerUser`, written beside `metadata.owner` (the identity `@id`)
so the rows about an account still list after it is deleted. Null when the
record names none (every row written before #2041).

## Parameters

### record

`Record`\<`string`, `unknown`\>

## Returns

`string` \| `null`
