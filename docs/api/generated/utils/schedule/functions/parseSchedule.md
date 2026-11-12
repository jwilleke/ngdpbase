[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/schedule](../README.md) / parseSchedule

# Function: parseSchedule()

> __parseSchedule__(`input`, `options`): [`Schedule`](../interfaces/Schedule.md)

Defined in: src/utils/schedule.ts:116

Compile a schedule. Throws, with a message a job author can act on, for an
unknown shorthand, an invalid rule, an unknown time zone, `FREQ=SECONDLY`,
an `RSCALE` other than GREGORIAN, or slots closer than the minimum interval.

## Parameters

### input

[`ScheduleInput`](../type-aliases/ScheduleInput.md)

### options

[`ScheduleOptions`](../interfaces/ScheduleOptions.md)

## Returns

[`Schedule`](../interfaces/Schedule.md)
