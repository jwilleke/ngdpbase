[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/delegation](../README.md) / lackingScopes

# Function: lackingScopes()

> __lackingScopes__(`scopes`, `holds`): `Promise`\<`string`[]\>

Defined in: src/utils/delegation.ts:71

"Delegate, not grant" (#1178, #1762): the scopes the delegator does not hold,
in order. Empty means every scope is theirs to hand on. `holds` is asked of
the policy decision point; with no answer there is no delegation.

## Parameters

### scopes

readonly `string`[]

### holds

(`scope`) => `Promise`\<`boolean`\>

## Returns

`Promise`\<`string`[]\>
