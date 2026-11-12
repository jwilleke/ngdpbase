[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / unenforcedConditionsLine

# Function: unenforcedConditionsLine()

> __unenforcedConditionsLine__(`policies`): `string` \| `null`

Defined in: src/utils/policyAttributes.ts:473

The start-up log line for the same policies, in full: the condition to write, the attribute
declaration it needs, and the entry types with no equivalent (#2334). Null when none has one.
Nothing in the decision path reads that array, so a rule written there limits no access.

## Parameters

### policies

`unknown`

## Returns

`string` \| `null`
