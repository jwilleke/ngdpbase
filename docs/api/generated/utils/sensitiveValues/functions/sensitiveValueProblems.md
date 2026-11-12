[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / sensitiveValueProblems

# Function: sensitiveValueProblems()

> __sensitiveValueProblems__(`read`): `string`[]

Defined in: src/utils/sensitiveValues.ts:105

What is wrong with the declared entries, one line each (#1889): an entry
that is not a well-formed key or path, or a level that is none of
`"secret"`, `"sensitive"`, `true`, `false`, `null`. [valueLevels](valueLevels.md)
drops each such entry; the engine warns at boot.

## Parameters

### read

`Read`

## Returns

`string`[]
