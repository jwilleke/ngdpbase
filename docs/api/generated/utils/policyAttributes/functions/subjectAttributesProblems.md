[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / subjectAttributesProblems

# Function: subjectAttributesProblems()

> __subjectAttributesProblems__(`raw`, `sensitive`): `string`[]

Defined in: src/utils/policyAttributes.ts:300

What is wrong with the value of `ngdpbase.access.subject-attributes` itself
(#2287), one message each: not an object; `id` or `aal` declared with any
meaning but the built-in one (the built-in is kept regardless; the same
declaration as the built-in is harmless and not reported); and any other
declaration `subjectDeclarationProblem` refuses. Used on save, on load and at boot.

## Parameters

### raw

`unknown`

### sensitive

readonly `string`[]

## Returns

`string`[]
