[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/schedule](../README.md) / Schedule

# Interface: Schedule

Defined in: src/utils/schedule.ts:38

## Properties

### dtstart

> __dtstart__: `string`

Defined in: src/utils/schedule.ts:42

The wall-clock start the recurrence is counted from, e.g. `2000-01-01T00:00:00`.

***

### rrule

> __rrule__: `string`

Defined in: src/utils/schedule.ts:40

The RRULE that was compiled (after shorthand expansion).

***

### timeZone

> __timeZone__: `string`

Defined in: src/utils/schedule.ts:43

## Methods

### nextSlot()

> __nextSlot__(`after`): `Date` \| `null`

Defined in: src/utils/schedule.ts:45

The first slot strictly after `after`, or null when the rule has ended.

#### Parameters

##### after

`Date`

#### Returns

`Date` \| `null`

***

### slotsBetween()

> __slotsBetween__(`from`, `to`): `Date`[]

Defined in: src/utils/schedule.ts:47

Every slot in `[from, to]`, oldest first.

#### Parameters

##### from

`Date`

##### to

`Date`

#### Returns

`Date`[]
