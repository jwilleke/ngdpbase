[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditLifecycle](../README.md) / assessPreviousRun

# Function: assessPreviousRun()

> __assessPreviousRun__(`lastStart`, `lastShutdown`): [`PreviousRun`](../type-aliases/PreviousRun.md)

Defined in: src/utils/auditLifecycle.ts:56

Decide how the previous run ended, from the latest record of each phase.

Deliberately conservative in three places, because the whole value of this
is that it does not overclaim:

- No start on record is `none`, not `unclean`. A first boot must not accuse
  itself, or every new instance cries wolf and the signal stops being read.
- A shutdown with no start is `unknown`, not `clean`. That is only reachable
  through a truncated or rotated log, and concluding "clean" from half the
  evidence is the failure this exists to prevent.
- Equal timestamps are `unclean`. Same-millisecond records cannot establish
  ordering, so the shutdown did not *demonstrably* follow the start.

## Parameters

### lastStart

[`LifecycleRecord`](../interfaces/LifecycleRecord.md) \| `null`

### lastShutdown

[`LifecycleRecord`](../interfaces/LifecycleRecord.md) \| `null`

## Returns

[`PreviousRun`](../type-aliases/PreviousRun.md)
