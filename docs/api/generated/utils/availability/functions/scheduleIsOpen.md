[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / scheduleIsOpen

# Function: scheduleIsOpen()

> __scheduleIsOpen__(`schedule`, `now`, `fallbackZone`): `boolean`

Defined in: src/utils/availability.ts:251

Whether a schedule is open at `now`.

A `deny` rule matching the day closes it outright. Otherwise an `allow` rule
must match both the day and the time window. A schedule with no rules is
open — an empty schedule is not a lockout.

## Parameters

### schedule

[`Schedule`](../interfaces/Schedule.md)

### now

`Date`

### fallbackZone

`string`

## Returns

`boolean`
