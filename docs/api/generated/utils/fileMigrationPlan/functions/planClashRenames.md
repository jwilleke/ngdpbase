[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/fileMigrationPlan](../README.md) / planClashRenames

# Function: planClashRenames()

> __planClashRenames__(`files`, `digits`): `Map`\<`string`, `string`\>

Defined in: src/utils/fileMigrationPlan.ts:72

The new name of every file in one place that shares its name with another
(id → new name). The oldest keeps the name (then the lowest id, so the
answer is the same on every run); the rest are numbered from 1 in that
order, skipping any name already used in the place. Names match exactly,
as a link finds a file today.

## Parameters

### files

readonly `Pick`\<[`FileRecord`](../../../types/File/type-aliases/FileRecord.md), `"id"` \| `"filename"` \| `"dateCreated"`\>[]

### digits

`number`

## Returns

`Map`\<`string`, `string`\>
