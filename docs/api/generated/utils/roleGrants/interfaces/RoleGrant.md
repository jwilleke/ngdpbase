[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/roleGrants](../README.md) / RoleGrant

# Interface: RoleGrant

Defined in: src/utils/roleGrants.ts:17

## Extended by

- [`SubjectGrant`](SubjectGrant.md)

## Properties

### action

> __action__: `string`

Defined in: src/utils/roleGrants.ts:18

***

### limited

> __limited__: `boolean`

Defined in: src/utils/roleGrants.ts:20

True when every policy granting it applies to some resources only.

***

### where

> __where__: `string`[]

Defined in: src/utils/roleGrants.ts:22

For a limited grant, the resource types it is limited to — `vault` reads "in your own vaults" (#1539).
