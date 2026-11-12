[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / conditionHolds

# Function: conditionHolds()

> __conditionHolds__(`condition`, `read`, `depth?`): `Promise`\<`boolean` \| `undefined`\>

Defined in: src/managers/PolicyEvaluator.ts:259

Is the condition true, false or unknown (#2255, #2261)? `true` or `false`,
or `undefined` when it cannot be told because an attribute it reads is
missing, or an argument lacks the datatype its function takes; the caller
fails closed on that. Each node is judged on its own: a missing attribute
makes its comparison unknown, a true branch decides `or`, a false branch
decides `and`, and `not` of unknown is unknown.

## Parameters

### condition

[`PolicyCondition`](../../../types/Policy/type-aliases/PolicyCondition.md) \| `undefined`

### read

[`AttributeReader`](../type-aliases/AttributeReader.md) \| `undefined`

### depth?

`number` = `1`

## Returns

`Promise`\<`boolean` \| `undefined`\>
