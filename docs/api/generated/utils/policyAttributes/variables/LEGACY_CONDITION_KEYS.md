[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / LEGACY\_CONDITION\_KEYS

# Variable: LEGACY\_CONDITION\_KEYS

> `const` __LEGACY\_CONDITION\_KEYS__: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: src/utils/policyAttributes.ts:87

The shape before #2330, key by key, and what replaces it, so the validator
can say what to write. Not read by the evaluator: an old condition never holds.
