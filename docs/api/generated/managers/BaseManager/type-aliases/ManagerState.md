[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / ManagerState

# Type Alias: ManagerState

> __ManagerState__ = `"ready"` \| `"degraded"` \| `"disabled"` \| `"failed"`

Defined in: src/managers/BaseManager.ts:251

What a manager is doing, uniformly (#1155).

Managers already degraded — `preflightConfiguredPath()` existed and 11 of
them called it — but each did so in its own way: a log line, a private flag,
an early return. Thirteen could end up degraded and exactly ONE reported it
anywhere a person could see. So an operator who mistyped
`ngdpbase.backup.directory` got backups that silently never ran, an instance
answering 302, a readiness probe saying ok, and a dashboard saying nothing.

Four values rather than a boolean, because an operator's response differs:

- `ready`    — working
- `degraded` — configured, wanted, and NOT working. The invisible one
- `disabled` — deliberately off; not a problem and must not read as one
- `failed`   — could not initialise at all

`disabled` versus `degraded` is what decides whether the report is worth
reading. A report that warns about features somebody switched off is one
nobody reads, and then the real warning is missed with it.
