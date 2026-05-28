---
name: OrganizationManager
description: Canonical Organization records (#617) — one file per organization, pluggable via OrganizationProvider
dateModified: '2026-05-28'
category: managers
code: src/managers/OrganizationManager.ts
---

# OrganizationManager

Canonical core record for Organization entities (#617). One file per organization on disk; read/write goes through an injected `OrganizationProvider`. Caches install-anchor lookups + by-id / by-file lookups for read-hot paths (`UserManager.syncPersonOnCreate`, `UserManager.applyRoleDiff`).

## Why this exists

Pre-#617, organization records were ad-hoc (sometimes a list in config, sometimes derived from users). Centralizing them as first-class records lets `Role`, `Person`, and per-organization audit trails reference a stable Organization ID instead of a string name.

## Provider Pattern

`OrganizationProvider` is the storage abstraction. The default implementation is [FileOrganizationProvider](../providers/FileOrganizationProvider.md) (one JSON file per org under `data/organizations/`). Other backends could swap in (database, CRM API) without affecting the manager.

## See Also

- [FileOrganizationProvider](../providers/FileOrganizationProvider.md)
- [PersonManager](PersonManager.md), [RoleManager](RoleManager.md) — sibling canonical-record managers
- `src/types/Organization.ts` — `Organization`, `OrganizationUpdate`, `PostalAddress`, `ContactPoint`
- Issue #617 — original canonical-records design
- Issue #620 — caching hot-path lookups
