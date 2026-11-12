[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/jobState](../README.md) / JobStateProvider

# Interface: JobStateProvider

Defined in: src/providers/jobState.ts:72

## Properties

### backend

> `readonly` __backend__: `"file"` \| `"sqlite"`

Defined in: src/providers/jobState.ts:73

## Methods

### clearCheckpoint()

> __clearCheckpoint__(`jobId`, `runId`): `Promise`\<`void`\>

Defined in: src/providers/jobState.ts:83

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<`void`\>

***

### close()?

> `optional` __close__(): `void`

Defined in: src/providers/jobState.ts:93

#### Returns

`void`

***

### getState()

> __getState__(`jobId`): `Promise`\<[`JobState`](JobState.md) \| `null`\>

Defined in: src/providers/jobState.ts:74

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobState`](JobState.md) \| `null`\>

***

### listRuns()

> __listRuns__(`jobId`): `Promise`\<[`JobRunRecord`](JobRunRecord.md)[]\>

Defined in: src/providers/jobState.ts:79

The job's runs, newest first.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobRunRecord`](JobRunRecord.md)[]\>

***

### loadCheckpoint()

> __loadCheckpoint__(`jobId`, `runId`): `Promise`\<`unknown`\>

Defined in: src/providers/jobState.ts:82

#### Parameters

##### jobId

`string`

##### runId

`string`

#### Returns

`Promise`\<`unknown`\>

***

### putState()

> __putState__(`state`): `Promise`\<`void`\>

Defined in: src/providers/jobState.ts:75

#### Parameters

##### state

[`JobState`](JobState.md)

#### Returns

`Promise`\<`void`\>

***

### recordRun()

> __recordRun__(`jobId`, `run`): `Promise`\<`void`\>

Defined in: src/providers/jobState.ts:77

Add or replace a run in the job's history, keeping the newest `historyLimit`.

#### Parameters

##### jobId

`string`

##### run

[`JobRunRecord`](JobRunRecord.md)

#### Returns

`Promise`\<`void`\>

***

### releaseLock()

> __releaseLock__(`jobId`, `slot`, `owner`): `Promise`\<`void`\>

Defined in: src/providers/jobState.ts:92

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

***

### renewLock()

> __renewLock__(`jobId`, `slot`, `owner`, `ttlMs`): `Promise`\<`boolean`\>

Defined in: src/providers/jobState.ts:90

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

***

### saveCheckpoint()

> __saveCheckpoint__(`jobId`, `runId`, `data`): `Promise`\<`void`\>

Defined in: src/providers/jobState.ts:81

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

***

### takeLock()

> __takeLock__(`jobId`, `slot`, `owner`, `ttlMs`): `Promise`\<`boolean`\>

Defined in: src/providers/jobState.ts:88

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
