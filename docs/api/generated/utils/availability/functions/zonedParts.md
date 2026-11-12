[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / zonedParts

# Function: zonedParts()

> __zonedParts__(`now`, `timeZone`): `object`

Defined in: src/utils/availability.ts:126

The instant, in a named time zone, as the parts a schedule compares:
the weekday and minutes since midnight, plus the ISO date for a holiday,
and the local year and month (1–12), which a month boundary needs (#1998).
An add-on reaches it as `host.zonedParts`.

Uses `Intl` rather than arithmetic on the epoch so daylight saving is the
platform's problem, not ours.

## Parameters

### now

`Date`

### timeZone

`string`

## Returns

`object`

### date

> __date__: `string`

### day

> __day__: `string`

### minutes

> __minutes__: `number`

### month

> __month__: `number`

### year

> __year__: `number`
