[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/jobState](../README.md) / JobStateLimits

# Interface: JobStateLimits

Defined in: src/providers/jobState.ts:62

## Extended by

- [`FileJobStateOptions`](../../FileJobStateProvider/interfaces/FileJobStateOptions.md)
- [`SqliteJobStateOptions`](../../SqliteJobStateProvider/interfaces/SqliteJobStateOptions.md)

## Properties

### checkpointMaxBytes?

> `optional` __checkpointMaxBytes?__: `number`

Defined in: src/providers/jobState.ts:66

Largest checkpoint accepted, in bytes of JSON. Default 256 KiB.

***

### historyLimit?

> `optional` __historyLimit?__: `number`

Defined in: src/providers/jobState.ts:64

Runs kept per job (`ngdpbase.jobs.history-limit`). Default 50.
