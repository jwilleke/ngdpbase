[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/systemCategoryRules](../README.md) / systemCategoryValueProblems

# Function: systemCategoryValueProblems()

> __systemCategoryValueProblems__(`key`, `entry`): [`SystemCategoryValueProblem`](../interfaces/SystemCategoryValueProblem.md)[]

Defined in: src/utils/systemCategoryRules.ts:38

What is wrong with the types of one entry's values, one per field, naming
the entry and the field. Empty when sound. `defaultPrivate` is the boolean
`true` or `false`, or the string `"choice"`; `encrypt`, `comments` and
`footnotes` are booleans.
Any other `defaultPrivate` or `encrypt` is compared as false by every
reader, so the string `"true"` would start pages public and leave the vault
unsealed. Any other `comments` or `footnotes` is read as on, since only
`false` turns a tab off.

## Parameters

### key

`string`

### entry

`unknown`

## Returns

[`SystemCategoryValueProblem`](../interfaces/SystemCategoryValueProblem.md)[]
