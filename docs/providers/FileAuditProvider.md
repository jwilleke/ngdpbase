---
name: FileAuditProvider
description: Appends audit events to JSONL files on local disk — the default backend
dateModified: '2026-05-28'
category: providers
code: src/providers/FileAuditProvider.ts
---

# FileAuditProvider

Default audit backend. Writes one JSONL file per day under `data/audit/YYYY-MM-DD.jsonl`. Each line is a serialized `AuditEvent`. Simple, replayable, easy to ship to log aggregators.

## Configuration

- `ngdpbase.audit.provider` = `file` (default)
- `ngdpbase.audit.file.storagedir` — directory (default `./data/audit`)
- `ngdpbase.audit.file.rotation` — daily / weekly / monthly (default daily)

## See Also

- [BaseAuditProvider](BaseAuditProvider.md) — the contract
- [DatabaseAuditProvider](DatabaseAuditProvider.md), [CloudAuditProvider](CloudAuditProvider.md), [NullAuditProvider](NullAuditProvider.md) — sibling backends
