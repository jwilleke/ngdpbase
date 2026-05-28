---
name: NullAuditProvider
description: Discards all audit events — for tests and minimal-config deployments where auditing is off
dateModified: '2026-05-28'
category: providers
code: src/providers/NullAuditProvider.ts
---

# NullAuditProvider

No-op audit provider. `log()` discards the event; `search()` returns empty. Used when auditing is disabled (set `ngdpbase.audit.enabled = false` or `ngdpbase.audit.provider = null`).

Also useful in unit tests where the audit side-effect would be noise.

## Configuration

- `ngdpbase.audit.provider` = `null`

## See Also

- [BaseAuditProvider](BaseAuditProvider.md) — the contract
- [FileAuditProvider](FileAuditProvider.md), [DatabaseAuditProvider](DatabaseAuditProvider.md), [CloudAuditProvider](CloudAuditProvider.md) — sibling backends
