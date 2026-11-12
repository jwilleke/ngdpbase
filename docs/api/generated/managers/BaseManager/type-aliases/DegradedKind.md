[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / DegradedKind

# Type Alias: DegradedKind

> __DegradedKind__ = `"outage"` \| `"attention"`

Defined in: src/managers/BaseManager.ts:266

What a `degraded` or `failed` state means for the person reading it (#1946).

- `outage`    — the feature is NOT working: what it provides is not happening
- `attention` — the feature works, but an administrator has something to do:
  save the backup key off the server, fix a mistyped value that is read as
  false, move vault files in. Telling them their backups are "silently doing
  nothing" while backups run is a false alarm, and false alarms teach people
  to skip the real one.

Declared where the state is set (`markDegraded` versus `markNeedsAttention`),
never inferred from the reason's wording.
