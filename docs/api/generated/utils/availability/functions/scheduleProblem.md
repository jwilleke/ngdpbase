[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/availability](../README.md) / scheduleProblem

# Function: scheduleProblem()

> __scheduleProblem__(`schedule`, `fallbackZone`): `string` \| `null`

Defined in: src/utils/availability.ts:202

The first thing in a schedule that is not in its exact allowed shape, or
`null`. The shape is an allowlist, so a misspelled key reads as a problem,
never as an open window: top-level keys `name`, `description`, `message`
(text), `timeZone` (a known IANA zone), `enabled` (true or false), `rules`
(a list) and `exceptions` (only empty); each rule an object with `type`
(`allow`, `deny` or absent), `days` (a non-empty list of weekday names) and
`startTime` and `endTime` (HH:MM, both or neither). A `deny` rule closes its
whole day, so times on it are a problem rather than silently ignored.
Names the path (`rules[1].dayz`), never a value. The site gate lets a
malformed schedule stay open; a policy must not (#2261).

## Parameters

### schedule

[`Schedule`](../interfaces/Schedule.md)

### fallbackZone

`string`

## Returns

`string` \| `null`
