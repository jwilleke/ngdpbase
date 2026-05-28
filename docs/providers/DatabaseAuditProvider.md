---
name: DatabaseAuditProvider
description: SQL-backed audit storage — writes events to a relational database
dateModified: '2026-05-28'
category: providers
code: src/providers/DatabaseAuditProvider.ts
---

# DatabaseAuditProvider

Stores audit events in a SQL database. Use when you want SQL-queryable audit history (joins to other application data, ad-hoc operator queries, etc.).

## Configuration

- `ngdpbase.audit.provider` = `database`
- `ngdpbase.audit.database.*` — connection settings (driver, host, credentials, table name)

## See Also

- [BaseAuditProvider](BaseAuditProvider.md) — the contract
- [FileAuditProvider](FileAuditProvider.md), [CloudAuditProvider](CloudAuditProvider.md), [NullAuditProvider](NullAuditProvider.md) — sibling backends
- `src/managers/AuditManager.ts` — consumer
