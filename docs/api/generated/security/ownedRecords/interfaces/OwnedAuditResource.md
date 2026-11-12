[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/ownedRecords](../README.md) / OwnedAuditResource

# Interface: OwnedAuditResource

Defined in: src/security/ownedRecords.ts:54

The resource a refusal is audited against (#1823). `owner` is the identity

## Id

from the stored row, `ownerUser` that person's username. Both come from
storage, never from the request body.

## Properties

### id?

> `optional` __id?__: `string`

Defined in: src/security/ownedRecords.ts:56

***

### owner?

> `optional` __owner?__: `string`

Defined in: src/security/ownedRecords.ts:57

***

### ownerUser?

> `optional` __ownerUser?__: `string`

Defined in: src/security/ownedRecords.ts:58

***

### type

> __type__: `string`

Defined in: src/security/ownedRecords.ts:55
