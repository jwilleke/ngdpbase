---
name: BaseAuditProvider
description: Abstract interface for audit-log providers — extension surface for storing audit events
dateModified: '2026-05-28'
category: providers
code: src/providers/BaseAuditProvider.ts
---

# BaseAuditProvider

Abstract contract for storing + querying audit events (who did what, when). Implementations choose the backend (file, database, cloud service, dev-null).

## Implementations

- [FileAuditProvider](FileAuditProvider.md) — JSONL files on local disk
- [DatabaseAuditProvider](DatabaseAuditProvider.md) — SQL-backed
- [CloudAuditProvider](CloudAuditProvider.md) — external service
- [NullAuditProvider](NullAuditProvider.md) — discards events (test / minimal config)

## Contract

- `log(event)` — append a new audit event
- `search(filters)` — query by user / action / time range / etc.
- `getProviderInfo()` — diagnostics

## `AuditFilters` (high level)

| Field | Purpose |
|---|---|
| `user` | Filter by username |
| `action` | Filter by action key |
| `timeRange` | `{from, to}` |
| `limit`, `offset` | Pagination |

## See Also

- `src/managers/AuditManager.ts` — consumer
- `src/types/index.ts` — `AuditEvent` shape
