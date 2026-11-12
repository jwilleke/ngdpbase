[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/FileJobStateProvider](../README.md) / FileJobStateOptions

# Interface: FileJobStateOptions

Defined in: src/providers/FileJobStateProvider.ts:36

## Extends

- [`JobStateLimits`](../../jobState/interfaces/JobStateLimits.md)

## Properties

### checkpointMaxBytes?

> `optional` __checkpointMaxBytes?__: `number`

Defined in: src/providers/jobState.ts:66

Largest checkpoint accepted, in bytes of JSON. Default 256 KiB.

#### Inherited from

[`JobStateLimits`](../../jobState/interfaces/JobStateLimits.md).[`checkpointMaxBytes`](../../jobState/interfaces/JobStateLimits.md#checkpointmaxbytes)

***

### historyLimit?

> `optional` __historyLimit?__: `number`

Defined in: src/providers/jobState.ts:64

Runs kept per job (`ngdpbase.jobs.history-limit`). Default 50.

#### Inherited from

[`JobStateLimits`](../../jobState/interfaces/JobStateLimits.md).[`historyLimit`](../../jobState/interfaces/JobStateLimits.md#historylimit)

***

### now?

> `optional` __now?__: () => `number`

Defined in: src/providers/FileJobStateProvider.ts:41

For tests: the clock.

#### Returns

`number`

***

### platform?

> `optional` __platform?__: `string`

Defined in: src/providers/FileJobStateProvider.ts:39

***

### statfs?

> `optional` __statfs?__: (`p`) => [`StatFsLike`](../../sqliteLocation/interfaces/StatFsLike.md)

Defined in: src/providers/FileJobStateProvider.ts:38

For tests: the filesystem probe and platform behind the network-filesystem refusal.

#### Parameters

##### p

`string`

#### Returns

[`StatFsLike`](../../sqliteLocation/interfaces/StatFsLike.md)
