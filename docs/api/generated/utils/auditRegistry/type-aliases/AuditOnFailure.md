[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditRegistry](../README.md) / AuditOnFailure

# Type Alias: AuditOnFailure

> __AuditOnFailure__ = `"refuse"` \| `"continue"`

Defined in: src/utils/auditRegistry.ts:45

What happens when the record cannot be written (#1121, #1158, #1218).

- `refuse`   — the action must not complete unless the record does; the
               write is flushed to the device before the action proceeds
- `continue` — the action proceeds; the lost record is counted and surfaced

This is failure handling, not importance. How important an event is lives
on each record as `severity`. Until #1218 this field was called `tier` with
values `critical` / `standard` / `volume`, which read as an importance
scale that it never was; `volume` was `continue` plus `enabled: false`.
