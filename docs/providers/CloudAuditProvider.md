---
name: CloudAuditProvider
description: Forwards audit events to an external cloud audit service
dateModified: '2026-05-28'
category: providers
code: src/providers/CloudAuditProvider.ts
---

# CloudAuditProvider

Forwards audit events to an external cloud audit service (HTTPS endpoint with bearer-token auth). Use when you want a central immutable audit trail across multiple ngdpbase instances.

## Configuration

- `ngdpbase.audit.provider` = `cloud`
- `ngdpbase.audit.cloud.endpoint` — HTTPS URL
- `ngdpbase.audit.cloud.token` — bearer token
- `ngdpbase.audit.cloud.timeout` — request timeout (ms)

## Trade-offs vs sibling providers

| Provider | Use when |
|---|---|
| [FileAuditProvider](FileAuditProvider.md) | Single-instance / local-only — append-only JSONL files |
| [DatabaseAuditProvider](DatabaseAuditProvider.md) | SQL-queryable audit trail in your existing DB |
| **CloudAuditProvider** | Multi-instance / immutable / external-SIEM ingestion |
| [NullAuditProvider](NullAuditProvider.md) | Tests / minimal config |

## See Also

- [BaseAuditProvider](BaseAuditProvider.md) — the contract
- `src/managers/AuditManager.ts` — consumer
