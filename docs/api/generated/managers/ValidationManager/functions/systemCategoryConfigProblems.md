[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/ValidationManager](../README.md) / systemCategoryConfigProblems

# Function: systemCategoryConfigProblems()

> __systemCategoryConfigProblems__(`categories`): `string`[]

Defined in: src/managers/ValidationManager.ts:97

What is wrong with a `ngdpbase.system-category` map, one line per problem
(#1504). Empty when it is sound. Startup refuses a map with problems
(operator, 2026-09-28): each one could put a private page in the wrong
place, so it must never run.

- exactly one entry has `default: true`;
- every `storageLocation.privatestore` is `pages/<parent>/{user}/<vault id>/`;
- no two entries share a vault;
- every vault has the same parent folder.

## Parameters

### categories

`unknown`

## Returns

`string`[]
