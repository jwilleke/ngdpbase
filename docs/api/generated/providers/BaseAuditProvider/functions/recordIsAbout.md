[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / recordIsAbout

# Function: recordIsAbout()

> __recordIsAbout__(`record`, `person`, `ownerId?`): `boolean`

Defined in: src/providers/BaseAuditProvider.ts:230

Whether a record is about the user `person` (#1537): the user is its `user`
(the account acted on, or the user represented under a proxy grant), its
`actor` (who actually did it, under a proxy grant), or the owner of the
resource it names ([recordOwner](recordOwner.md)). The owner is the user's identity
`@id` (`ownerId`) on rows written from #2041 on, with their username
beside it ([recordOwnerUser](recordOwnerUser.md)), and their username on rows written
before, which are never rewritten; any of them matches. The username
beside the `@id` is what lists the rows of an account deleted since.

## Parameters

### record

`Record`\<`string`, `unknown`\>

### person

`string`

### ownerId?

`string`

## Returns

`boolean`
