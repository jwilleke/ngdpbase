[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextFromOperator

# Function: jobContextFromOperator()

> __jobContextFromOperator__(`username`, `reason`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:211

An operator acting from the command line (#1179) — `scripts/restart-audit-chain.ts`
and its kind. There is a person, named on the command, and no request; the
origin says so, and the reason is the command's own.

## Parameters

### username

`string`

### reason

`string`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
