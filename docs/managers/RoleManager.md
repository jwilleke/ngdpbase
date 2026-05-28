---
name: RoleManager
description: Canonical Role records — one file per (organization, namedPosition) pair (#617 follow-up)
dateModified: '2026-05-28'
category: managers
code: src/managers/RoleManager.ts
---

# RoleManager

Canonical store for `OrganizationRole` bindings. One file per `(organization, namedPosition)` pair. Members of a role are stored within the role record, so "who holds role X at org Y" is one read.

Distinct from the platform's **system roles** (`admin`, `editor`, `contributor`, `reader`, `occupant`) which are config-driven and used by the ACL evaluator. RoleManager handles **business roles** (e.g. "Board President at Acme Corp"), referenced by Person + Organization records.

## Why this exists

Follow-up to #617. Once Organization and Person became first-class records, role bindings needed their own home so the role couldn't be lost if the person's user account changed.

## Provider Pattern

`RoleProvider` is the storage abstraction. Default: [FileRoleProvider](../providers/FileRoleProvider.md) (one JSON per role under `data/roles/`).

## See Also

- [FileRoleProvider](../providers/FileRoleProvider.md)
- [OrganizationManager](OrganizationManager.md), [PersonManager](PersonManager.md)
- `src/types/Role.ts` — `Role`, `RoleUpdate`
- Issue #617 — canonical-records design
- Page Audience + Roles documentation: `/view/roles`
