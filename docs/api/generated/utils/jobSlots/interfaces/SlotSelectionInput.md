[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/jobSlots](../README.md) / SlotSelectionInput

# Interface: SlotSelectionInput

Defined in: src/utils/jobSlots.ts:29

## Properties

### busyUntil

> __busyUntil__: `Date` \| `null`

Defined in: src/utils/jobSlots.ts:34

When this job's last run in this process ended; null when it has not run since start.

***

### catchUp

> __catchUp__: [`CatchUp`](../type-aliases/CatchUp.md)

Defined in: src/utils/jobSlots.ts:37

***

### due

> __due__: `Date`[]

Defined in: src/utils/jobSlots.ts:31

The due slots, oldest first.

***

### now

> __now__: `Date`

Defined in: src/utils/jobSlots.ts:32

***

### onTimeMs

> __onTimeMs__: `number`

Defined in: src/utils/jobSlots.ts:36

A slot that came due at most this long ago is on time, not missed.

***

### overlap

> __overlap__: [`Overlap`](../type-aliases/Overlap.md)

Defined in: src/utils/jobSlots.ts:38
