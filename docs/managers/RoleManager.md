---
name: RoleManager
description: Canonical Role records — one file per (organization, namedPosition) pair (#617 follow-up)
dateModified: '2026-09-21'
category: managers
code: src/managers/RoleManager.ts
---

# RoleManager

Canonical store for `OrganizationRole` bindings. One file per `(organization, namedPosition)` pair. Members of a role are stored within the role record, so "who holds role X at org Y" is one read.

Which roles __exist__ is a declaration in configuration (`ngdpbase.roles.definitions`), read through `ConfigurationManager`. What a role __permits__ is the access policies. RoleManager owns the third fact: __who holds which role__ — the system roles (`admin`, `editor`, …) on the install's anchor Organization, and business roles (e.g. "Board President at Acme Corp") alike.

## Membership

Moved here from `UserManager` in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 12. Callers hold usernames; `PersonManager` maps a username to the Person `@id` a record lists.

| Method | For |
| --- | --- |
| `resolveUserRoles(username)` | the user's role names, live; `[]` when there is no Person or no record |
| `hasRole(username, roleName)` | the same question for one role — a lookup, not an access decision |
| `assignRole(username, roleName, ctx)` / `removeRole(…)` | one role, for an existing account and a declared role; recorded as `user-edit` |
| `applyRoleDiff(username, oldRoles, newRoles)` | what `UserManager` calls when an account is created or edited; the account write records the audit event |
| `removeAllMemberships(username)` | a deleted account's Person leaves every role |

A write that cannot happen (no Person, no anchor Organization) is logged with its cause and does not throw, so an account write still succeeds when role storage is degraded (#1027).

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
