[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / aalFactsOf

# Function: aalFactsOf()

> __aalFactsOf__(`subject`): [`AalFacts`](../interfaces/AalFacts.md)

Defined in: src/utils/policyAttributes.ts:254

The fields of a request's subject that bear on its level, copied by name so
a subject rebuilt for a decision keeps them (the #1164 lesson: a field not
forwarded is silently lost). Reads nothing else from it.

## Parameters

### subject

`object` \| `null` \| `undefined`

## Returns

[`AalFacts`](../interfaces/AalFacts.md)
