[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/roleGrants](../README.md) / roleGrants

# Function: roleGrants()

> __roleGrants__(`policies`): `Record`\<`string`, [`RoleGrants`](../interfaces/RoleGrants.md)\>

Defined in: src/utils/roleGrants.ts:103

Every role a policy names, with what its policies allow and deny — the one
reading of "what a role grants" (#1539): the user forms, the profile, the
admin roles page and `PolicyDecisionPoint.rolePermissions` all come from
here.

## Parameters

### policies

readonly [`Policy`](../../../types/Policy/interfaces/Policy.md)[]

## Returns

`Record`\<`string`, [`RoleGrants`](../interfaces/RoleGrants.md)\>
