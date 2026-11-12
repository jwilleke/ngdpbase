[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextFromSchedule

# Function: jobContextFromSchedule()

> __jobContextFromSchedule__(`systemPrincipal`, `reason`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:253

As [jobContextFromSystem](jobContextFromSystem.md), for work started by a timer rather than at boot.

## Parameters

### systemPrincipal

`string`

### reason

`string`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
