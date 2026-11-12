[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobLastRun

# Interface: JobLastRun

Defined in: src/managers/BackgroundJobManager.ts:166

A job's newest ended run (#2138), from [BackgroundJobManager.lastFinishedRun](../classes/default.md#lastfinishedrun).

## Properties

### displayName

> __displayName__: `string`

Defined in: src/managers/BackgroundJobManager.ts:168

***

### jobId

> __jobId__: `string`

Defined in: src/managers/BackgroundJobManager.ts:167

***

### lastRun

> __lastRun__: [`LastJobRun`](LastJobRun.md) \| `null`

Defined in: src/managers/BackgroundJobManager.ts:170

Null when it has never run — or, with `sinceStart`, not since this server started.

***

### sinceStart

> __sinceStart__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:172

The job's history is kept in memory only (a maintenance tick, or no job state open): it starts empty at each start.
