---
name: FileRoleProvider
description: File-backed Role storage — one JSON file per (organization, namedPosition) pair under data/roles/
dateModified: '2026-05-28'
category: providers
code: src/providers/FileRoleProvider.ts
---

# FileRoleProvider

Default storage backend for [RoleManager](../managers/RoleManager.md). One JSON file per `(organization, namedPosition)` pair under `data/roles/`. Each file holds the role definition + its members.

## Storage

- Directory: `data/roles/` (configurable via `ngdpbase.roles.storagedir`)
- Format: JSON serialization of the `Role` type

## Distinction

This is for **business roles** (RoleManager domain — e.g. "Board President at Acme Corp"). Distinct from the platform's **system roles** (`admin`, `editor`, `contributor`, …) which live in `app-default-config.json` under `ngdpbase.roles.definitions` and are read by the ACL evaluator.

## See Also

- [RoleManager](../managers/RoleManager.md) — consumer
- `src/types/RoleProvider.ts` — the interface contract
- `src/types/Role.ts` — the record shape
- Issue #617 — canonical-records design
