[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / utils/schedule

# utils/schedule

The schedule engine for scheduled jobs (#1713, epic #1611).

A schedule is an iCalendar recurrence rule (RFC 5545 RRULE), the format the
calendar add-on already stores, with a start (`dtstart`) and a time zone.
Cron is not used: it cannot say "every 30 days" or "the last business day".
Named shorthands (`daily 06:00`, `end-of-month`, …) expand to an RRULE.

Recurrence is computed on wall-clock time and then placed in the time zone,
so daylight saving does what a person expects:

- spring forward: a slot inside the skipped hour runs at the next valid
    instant (02:30 becomes 03:30), rather than not at all;
- fall back: a slot inside the repeated hour runs once, at its first
    occurrence.
A date that does not exist is skipped, as RFC 5545 says: `BYMONTHDAY=31`
skips short months; the last day of a month is `BYMONTHDAY=-1`. RFC 7529
(RSCALE / SKIP) is not used (operator, 2026-10-08).

Pure: no configuration is read here. The caller passes the default time zone
(`ngdpbase.default.timezone`) and the minimum interval.

## Interfaces

- [Schedule](interfaces/Schedule.md)
- [ScheduleOptions](interfaces/ScheduleOptions.md)

## Type Aliases

- [ScheduleInput](type-aliases/ScheduleInput.md)

## Functions

- [expandShorthand](functions/expandShorthand.md)
- [parseSchedule](functions/parseSchedule.md)
