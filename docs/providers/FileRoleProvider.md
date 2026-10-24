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

This stores __who holds each role__ (RoleManager's job). Which roles exist (`admin`, `editor`, `contributor`, …) is declared in `app-default-config.json` under `ngdpbase.roles.definitions`, and what each permits is the access policies. A role is a set of permissions, held only by users; it is never a title. A title such as "Board President at Acme Corp" is an affiliation on the identity record, not a role record ([glossary](../GLOSSARY.md#identities)).

## See Also

- [RoleManager](../managers/RoleManager.md) — consumer
- `src/types/RoleProvider.ts` — the interface contract
- `src/types/Role.ts` — the record shape
- Issue #617 — canonical-records design
