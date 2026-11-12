[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/SqliteJobStateProvider](../README.md) / default

# Class: default

Defined in: src/providers/SqliteJobStateProvider.ts:31

## Implements

- [`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md)

## Constructors

### Constructor

> __new default__(`db`, `options?`): `SqliteJobStateProvider`

Defined in: src/providers/SqliteJobStateProvider.ts:37

#### Parameters

##### db

`Database`

##### options?

[`SqliteJobStateOptions`](../interfaces/SqliteJobStateOptions.md) = `{}`

#### Returns

`SqliteJobStateProvider`

## Properties

### backend

> `readonly` __backend__: `"sqlite"`

Defined in: src/providers/SqliteJobStateProvider.ts:32

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`backend`](../../jobState/interfaces/JobStateProvider.md#backend)

## Methods

### clearCheckpoint()

> __clearCheckpoint__(`jobId`, `runId`): `Promise`\<`void`\>

Defined in: src/providers/SqliteJobStateProvider.ts:104

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`clearCheckpoint`](../../jobState/interfaces/JobStateProvider.md#clearcheckpoint)

***

### getState()

> __getState__(`jobId`): `Promise`\<[`JobState`](../../jobState/interfaces/JobState.md) \| `null`\>

Defined in: src/providers/SqliteJobStateProvider.ts:43

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobState`](../../jobState/interfaces/JobState.md) \| `null`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`getState`](../../jobState/interfaces/JobStateProvider.md#getstate)

***

### listRuns()

> __listRuns__(`jobId`): `Promise`\<[`JobRunRecord`](../../jobState/interfaces/JobRunRecord.md)[]\>

Defined in: src/providers/SqliteJobStateProvider.ts:84

The job's runs, newest first.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobRunRecord`](../../jobState/interfaces/JobRunRecord.md)[]\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`listRuns`](../../jobState/interfaces/JobStateProvider.md#listruns)

***

### loadCheckpoint()

> __loadCheckpoint__(`jobId`, `runId`): `Promise`\<`unknown`\>

Defined in: src/providers/SqliteJobStateProvider.ts:98

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<`unknown`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`loadCheckpoint`](../../jobState/interfaces/JobStateProvider.md#loadcheckpoint)

***

### putState()

> __putState__(`state`): `Promise`\<`void`\>

Defined in: src/providers/SqliteJobStateProvider.ts:57

#### Parameters

##### state

[`JobState`](../../jobState/interfaces/JobState.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`putState`](../../jobState/interfaces/JobStateProvider.md#putstate)

***

### recordRun()

> __recordRun__(`jobId`, `run`): `Promise`\<`void`\>

Defined in: src/providers/SqliteJobStateProvider.ts:72

Add or replace a run in the job's history, keeping the newest `historyLimit`.

#### Parameters

##### jobId

`string`

##### run

[`JobRunRecord`](../../jobState/interfaces/JobRunRecord.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`recordRun`](../../jobState/interfaces/JobStateProvider.md#recordrun)

***

### releaseLock()

> __releaseLock__(`jobId`, `slot`, `owner`): `Promise`\<`void`\>

Defined in: src/providers/SqliteJobStateProvider.ts:126

Give up a lock this owner holds; a lock held by another owner is left alone.

#### Parameters

##### jobId

`string`

##### slot

`string`

##### owner

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`releaseLock`](../../jobState/interfaces/JobStateProvider.md#releaselock)

***

### renewLock()

> __renewLock__(`jobId`, `slot`, `owner`, `ttlMs`): `Promise`\<`boolean`\>

Defined in: src/providers/SqliteJobStateProvider.ts:119

Extend a lock this owner holds. False when it no longer holds it.

#### Parameters

##### jobId

`string`

##### slot

`string`

##### owner

`string`

##### ttlMs

`number`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`renewLock`](../../jobState/interfaces/JobStateProvider.md#renewlock)

***

### saveCheckpoint()

> __saveCheckpoint__(`jobId`, `runId`, `data`): `Promise`\<`void`\>

Defined in: src/providers/SqliteJobStateProvider.ts:90

Throws when the JSON is larger than `checkpointMaxBytes`.

#### Parameters

##### jobId

`string`

##### runId

`string`

##### data

`unknown`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`saveCheckpoint`](../../jobState/interfaces/JobStateProvider.md#savecheckpoint)

***

### takeLock()

> __takeLock__(`jobId`, `slot`, `owner`, `ttlMs`): `Promise`\<`boolean`\>

Defined in: src/providers/SqliteJobStateProvider.ts:109

Take the lock for one slot, or steal it when its holder let it expire.
True for exactly one caller among any that contend.

#### Parameters

##### jobId

`string`

##### slot

`string`

##### owner

`string`

##### ttlMs

`number`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`JobStateProvider`](../../jobState/interfaces/JobStateProvider.md).[`takeLock`](../../jobState/interfaces/JobStateProvider.md#takelock)
