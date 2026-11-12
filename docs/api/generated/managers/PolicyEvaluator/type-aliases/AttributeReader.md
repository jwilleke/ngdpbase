[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / AttributeReader

# Type Alias: AttributeReader

> __AttributeReader__ = (`name`) => `unknown` \| `Promise`\<`unknown`\>

Defined in: src/managers/PolicyEvaluator.ts:46

Reads one attribute a condition names, `subject:id` or `resource:owner`
(#2255). Supplied by the PDP from the PIP; `undefined` or `null` is a
missing attribute. Asked only when a matching policy has a condition. A
reader may be async (an identity is resolved through IdentityManager), and
the evaluator awaits every read.

## Parameters

### name

`string`

## Returns

`unknown` \| `Promise`\<`unknown`\>
