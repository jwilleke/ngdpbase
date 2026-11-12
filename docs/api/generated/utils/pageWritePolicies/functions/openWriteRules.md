[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / openWriteRules

# Function: openWriteRules()

> __openWriteRules__(`policies`): [`OpenWriteRule`](../interfaces/OpenWriteRule.md)[]

Defined in: src/utils/pageWritePolicies.ts:195

The allow rules in force that let `anyone` (signed-out visitors) or `authenticated` (every signed-in user)
do more than page-read, or give page writes to a role other than admin. Deny rules are left out.
Computed from the policies it is given, so what it returns follows the current policies.

## Parameters

### policies

readonly [`Policy`](../../../types/Policy/interfaces/Policy.md)[]

## Returns

[`OpenWriteRule`](../interfaces/OpenWriteRule.md)[]
