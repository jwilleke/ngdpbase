[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobRunSince

# Interface: JobRunSince

Defined in: src/managers/BackgroundJobManager.ts:60

One run between a backup and the restore of it (#1876): what admins are
told was done on the site and is no longer in the restored job state.

## Properties

### completedAt?

> `optional` __completedAt?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:63

***

### error?

> `optional` __error?__: `string`

Defined in: src/managers/BackgroundJobManager.ts:65

***

### jobId

> __jobId__: `string`

Defined in: src/managers/BackgroundJobManager.ts:61

***

### startedAt

> __startedAt__: `string`

Defined in: src/managers/BackgroundJobManager.ts:62

***

### status

> __status__: `"skipped"` \| `"failed"` \| `"running"` \| `"completed"` \| `"interrupted"`

Defined in: src/managers/BackgroundJobManager.ts:64
