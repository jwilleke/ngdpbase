[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / utils/jobSlots

# utils/jobSlots

Which due slots of a scheduled job run, and which are skipped (#1715, epic
# 1611). Pure: the scheduler in `BackgroundJobManager` hands it the slots
that are due and when the job was last busy, and records what it returns.

A slot is due when its time has come and it has not been handled. Due slots
come in two kinds, and each has its own rule:

- __came due while the job was running__ (before `busyUntil`): the job's
    `overlap` rule. `queue` keeps one waiting slot, the newest; `skip` keeps
    none. One job never runs twice at once.
- __came due while the job was idle, or the server was down__: the job's
    `catchUp` rule. A slot that came due within `onTimeMs` is on time, not
    missed: `none` runs only on-time slots, `latest` runs the newest due slot,
    `all` runs the newest [CATCH\_UP\_ALL\_CAP](variables/CATCH_UP_ALL_CAP.md), oldest first.

Every due slot not run is skipped, so the caller records it: a slot is
never dropped without a trace (operator, 2026-10-08).

## Interfaces

- [SlotSelection](interfaces/SlotSelection.md)
- [SlotSelectionInput](interfaces/SlotSelectionInput.md)

## Type Aliases

- [CatchUp](type-aliases/CatchUp.md)
- [Overlap](type-aliases/Overlap.md)

## Variables

- [CATCH\_UP\_ALL\_CAP](variables/CATCH_UP_ALL_CAP.md)

## Functions

- [selectSlots](functions/selectSlots.md)
