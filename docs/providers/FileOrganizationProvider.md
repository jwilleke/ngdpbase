---
name: FileOrganizationProvider
description: File-backed Organization storage — one JSON file per organization under data/organizations/
dateModified: '2026-05-28'
category: providers
code: src/providers/FileOrganizationProvider.ts
---

# FileOrganizationProvider

Default storage backend for [OrganizationManager](../managers/OrganizationManager.md). One JSON file per Organization record under `data/organizations/`; filename derived from the org's slug + uuid via `src/utils/orgFilename.ts`.

## Storage

- Directory: `data/organizations/` (configurable via `ngdpbase.organizations.storagedir`)
- Filename pattern: `{slug}-{uuid-prefix}.json`
- Format: JSON serialization of the `Organization` type

## Read-Hot Path

`getByFile(filename)` is on the per-request hot path (`UserManager.syncPersonOnCreate` → `applyRoleDiff`). The provider caches install-anchor lookups + by-id / by-file lookups (#620).

## See Also

- [OrganizationManager](../managers/OrganizationManager.md) — consumer
- `src/types/OrganizationProvider.ts` — the interface contract
- `src/types/Organization.ts` — the record shape
- Issue #617 — canonical-records design
