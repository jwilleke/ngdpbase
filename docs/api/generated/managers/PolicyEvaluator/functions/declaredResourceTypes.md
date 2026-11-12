[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / declaredResourceTypes

# Function: declaredResourceTypes()

> __declaredResourceTypes__(`getProperty`): `Set`\<`string`\>

Defined in: src/managers/PolicyEvaluator.ts:408

The resource types configuration declares (#1504), for the evaluator and the
validator alike. When the key is not set at all — a configuration older than
it — the matchers' own types apply, so an older site keeps deciding as it
did; PolicyEvaluator.initialize() warns.

## Parameters

### getProperty

(`key`, `defaultValue`) => `unknown`

## Returns

`Set`\<`string`\>
