[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / ScheduledJobView

# Interface: ScheduledJobView

Defined in: src/managers/BackgroundJobManager.ts:134

A scheduled job as the admin page shows it (#1718).

## Properties

### catchUp

> __catchUp__: [`CatchUp`](../../../utils/jobSlots/type-aliases/CatchUp.md)

Defined in: src/managers/BackgroundJobManager.ts:141

***

### current

> __current__: [`JobRunRecord`](../../../providers/jobState/interfaces/JobRunRecord.md) \| `null`

Defined in: src/managers/BackgroundJobManager.ts:151

The run the state names as current: running, waiting for a retry, or interrupted.

***

### displayName

> __displayName__: `string`

Defined in: src/managers/BackgroundJobManager.ts:136

***

### enabled

> __enabled__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:146

False while `ngdpbase.jobs.<id>.enabled` is false: paused.

***

### id

> __id__: `string`

Defined in: src/managers/BackgroundJobManager.ts:135

***

### lastSlotDone

> __lastSlotDone__: `string` \| `null`

Defined in: src/managers/BackgroundJobManager.ts:149

***

### maxAttempts

> __maxAttempts__: `number`

Defined in: src/managers/BackgroundJobManager.ts:143

***

### nextSlot

> __nextSlot__: `string` \| `null`

Defined in: src/managers/BackgroundJobManager.ts:148

***

### overlap

> __overlap__: [`Overlap`](../../../utils/jobSlots/type-aliases/Overlap.md)

Defined in: src/managers/BackgroundJobManager.ts:142

***

### persist

> __persist__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:144

***

### rrule

> __rrule__: `string`

Defined in: src/managers/BackgroundJobManager.ts:139

***

### running

> __running__: `boolean`

Defined in: src/managers/BackgroundJobManager.ts:147

***

### runs

> __runs__: [`JobRunRecord`](../../../providers/jobState/interfaces/JobRunRecord.md)[]

Defined in: src/managers/BackgroundJobManager.ts:153

History, newest first. A run with no slot was started by hand.

***

### schedule

> __schedule__: `string`

Defined in: src/managers/BackgroundJobManager.ts:138

The schedule in force, as written (a shorthand or an RRULE), and what it compiled to.

***

### timeZone

> __timeZone__: `string`

Defined in: src/managers/BackgroundJobManager.ts:140
