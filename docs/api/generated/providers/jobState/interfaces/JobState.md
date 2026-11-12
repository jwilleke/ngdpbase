[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/jobState](../README.md) / JobState

# Interface: JobState

Defined in: src/providers/jobState.ts:47

## Properties

### current

> __current__: [`JobRunRecord`](JobRunRecord.md) \| `null`

Defined in: src/providers/jobState.ts:52

***

### jobId

> __jobId__: `string`

Defined in: src/providers/jobState.ts:48

***

### lastSlotDone

> __lastSlotDone__: `string` \| `null`

Defined in: src/providers/jobState.ts:49

***

### nextSlot

> __nextSlot__: `string` \| `null`

Defined in: src/providers/jobState.ts:51

The first slot not yet handled: run, skipped or failed (#1715).

***

### rule

> __rule__: `string` \| `null`

Defined in: src/providers/jobState.ts:59

The schedule the slots were computed from (`rrule|dtstart|timeZone`), so a
rule changed while the server was down is seen at the next start: slots
are recomputed from then, and nothing is caught up for the old rule
(#1715). Null for state written before the rule was kept.
