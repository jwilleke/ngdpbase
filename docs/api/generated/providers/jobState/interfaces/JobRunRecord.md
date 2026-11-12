[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/jobState](../README.md) / JobRunRecord

# Interface: JobRunRecord

Defined in: src/providers/jobState.ts:25

One run of a job. Times are ISO 8601 instants.

## Properties

### attempt

> __attempt__: `number`

Defined in: src/providers/jobState.ts:31

1 for the first try; a run resumed after a restart counts up.

***

### completedAt?

> `optional` __completedAt?__: `string`

Defined in: src/providers/jobState.ts:34

***

### error?

> `optional` __error?__: `string`

Defined in: src/providers/jobState.ts:35

***

### requestedBy

> __requestedBy__: [`JobContext`](../../../context/JobContext/interfaces/JobContext.md) \| `null`

Defined in: src/providers/jobState.ts:44

Who asked, for a run started by hand (#1746): the run is restarted as
them after a restart, or reported to them. `null` for a scheduled slot,
which runs as the system principal — said on purpose (#1399), never left
out. A record written before this field existed reads as having none.

***

### retryAt?

> `optional` __retryAt?__: `string`

Defined in: src/providers/jobState.ts:37

A failed attempt with attempts left: when it is tried again (#1716).

***

### runId

> __runId__: `string`

Defined in: src/providers/jobState.ts:26

***

### slot

> __slot__: `string` \| `null`

Defined in: src/providers/jobState.ts:28

The slot this run is for; null for a run someone started by hand.

***

### startedAt

> __startedAt__: `string`

Defined in: src/providers/jobState.ts:29

***

### status

> __status__: `"skipped"` \| `"failed"` \| `"running"` \| `"completed"` \| `"interrupted"`

Defined in: src/providers/jobState.ts:33

`skipped`: a slot the scheduler passed over, by its catch-up or overlap rule (#1715).
