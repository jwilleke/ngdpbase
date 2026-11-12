[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / COMPARISON\_FUNCTIONS

# Variable: COMPARISON\_FUNCTIONS

> `const` __COMPARISON\_FUNCTIONS__: `Readonly`\<`Record`\<`string`, [`ConditionFunction`](../interfaces/ConditionFunction.md)\>\>

Defined in: src/utils/policyAttributes.ts:61

The functions that compare two arguments, by XACML 3.0 name (core spec,
appendix A.3), in lowercase. `X-is-in` takes a value, then a bag: an attribute
that is a list, or a literal whose `value` is an array.
