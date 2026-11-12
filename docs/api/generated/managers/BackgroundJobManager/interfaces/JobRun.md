[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobRun

# Interface: JobRun

Defined in: src/managers/BackgroundJobManager.ts:286

State of a single job run instance.

## Properties

### attempt?

> `optional` __attempt?__: `number`

Defined in: src/managers/BackgroundJobManager.ts:297

***

### completedAt?

> `optional` __completedAt?__: `Date`

Defined in: src/managers/BackgroundJobManager.ts:302

***

### displayName

> __displayName__: `string`

Defined in: src/managers/BackgroundJobManager.ts:289

***

### interrupted?

> `optional` __interrupted?__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:300

Set at shutdown (#1717): the run was stopped to be handed to the next process, not failed.

***

### jobId

> __jobId__: `string`

Defined in: src/managers/BackgroundJobManager.ts:288

***

### progress?

> `optional` __progress?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:294

Live progress message set by the job via reportProgress(); cleared on completion

***

### requestedBy

> __requestedBy__: [`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

Defined in: src/managers/BackgroundJobManager.ts:291

Who asked for this work, and from where (#631).

***

### result?

> `optional` __result?__: [`JobResult`](JobResult.md)

Defined in: src/managers/BackgroundJobManager.ts:303

***

### resumeReason?

> `optional` __resumeReason?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:298

***

### runId

> __runId__: `string`

Defined in: src/managers/BackgroundJobManager.ts:287

***

### slot?

> `optional` __slot?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:296

For a scheduled run: its slot, its attempt, and why the attempt before it ended (#1716).

***

### startedAt

> __startedAt__: `Date`

Defined in: src/managers/BackgroundJobManager.ts:301

***

### status

> __status__: `"pending"` \| `"failed"` \| `"running"` \| `"completed"`

Defined in: src/managers/BackgroundJobManager.ts:292
