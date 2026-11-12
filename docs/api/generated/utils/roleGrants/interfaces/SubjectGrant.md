[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/roleGrants](../README.md) / SubjectGrant

# Interface: SubjectGrant

Defined in: src/utils/roleGrants.ts:32

A grant to one subject, with the policies that give it (#2067).

## Extends

- [`RoleGrant`](RoleGrant.md)

## Properties

### action

> __action__: `string`

Defined in: src/utils/roleGrants.ts:18

#### Inherited from

[`RoleGrant`](RoleGrant.md).[`action`](RoleGrant.md#action)

***

### by

> __by__: `string`[]

Defined in: src/utils/roleGrants.ts:34

The ids of the allow policies that give it, in id order.

***

### limited

> __limited__: `boolean`

Defined in: src/utils/roleGrants.ts:20

True when every policy granting it applies to some resources only.

#### Inherited from

[`RoleGrant`](RoleGrant.md).[`limited`](RoleGrant.md#limited)

***

### where

> __where__: `string`[]

Defined in: src/utils/roleGrants.ts:22

For a limited grant, the resource types it is limited to — `vault` reads "in your own vaults" (#1539).

#### Inherited from

[`RoleGrant`](RoleGrant.md).[`where`](RoleGrant.md#where)
