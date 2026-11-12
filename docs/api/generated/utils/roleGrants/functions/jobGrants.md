[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/roleGrants](../README.md) / jobGrants

# Function: jobGrants()

> __jobGrants__(`policies`): `Record`\<`string`, [`SubjectGrants`](../interfaces/SubjectGrants.md)\>

Defined in: src/utils/roleGrants.ts:117

Every scheduled job a policy names (`{ "type": "job", "value": "<job id>" }`,
# 1999), with what its policies allow and deny and which policy gives each
allow — the admin roles page's Jobs part (#2067). A job a policy names acts
as itself and holds only these. Display only, like [roleGrants](roleGrants.md).

## Parameters

### policies

readonly [`Policy`](../../../types/Policy/interfaces/Policy.md)[]

## Returns

`Record`\<`string`, [`SubjectGrants`](../interfaces/SubjectGrants.md)\>
