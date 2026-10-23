---
name: RoleManager
description: Canonical Role records — one file per (organization, namedPosition) pair (#617 follow-up)
dateModified: '2026-10-23'
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
| `grantToEveryAccountOnce(roleName, usernames, ctx)` | a role every account must hold, given at boot to the accounts that predate it — once: the role's record not existing is the record that it was never given, so a later removal stands; each grant recorded as `user-edit` under the system context ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)) |

A write that cannot happen (no Person, no anchor Organization) is logged with its cause and does not throw (#1027).

A write that fails is never only logged ([#2015](https://github.com/jwilleke/ngdpbase/issues/2015)): `assignRole` and `removeRole` reject with the cause, and `applyRoleDiff` tries every change, then throws a `RoleChangeError` (`src/utils/roleChangeError.ts`) naming the ones not saved. `UserManager.createUser` and `updateUser` keep the account write, record the roles the account really has, and then throw it, so the administrator's form shows which role change to make again. `grantToEveryAccountOnce` runs at boot with nobody to tell: it gives the role to every account it can and logs an error naming the rest.

Membership changes to one role record run one at a time, the read included (`KeyedSerial`, `src/utils/keyedSerial.ts`), so concurrent changes all land. The caches are not refilled by a read that started before a write.

## What a record holds

Identity (`@id`, `namedPosition`, `organization`) and `member` — nothing configuration already says. Records written before #1431 step 1 also carried a copy of the role's catalogue entry (`roleName`, `description`, `issystem`, `icon`, `color`) and a `permissions` list under `additionalProperty`, taken at create time and never updated. At every start RoleManager strips that copy from any record that still has it and logs how many it cleaned; on a clean store it does nothing (operator, 2026-09-21).

## Why this exists

Follow-up to #617. Once Organization and Person became first-class records, role bindings needed their own home so the role couldn't be lost if the person's user account changed.

## Provider Pattern

`RoleProvider` is the storage abstraction. Default: [FileRoleProvider](../providers/FileRoleProvider.md) (one JSON per role under `data/roles/`).

## Backup and restore

Role records (membership) are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.application.roles.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.roles.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FileRoleProvider](../providers/FileRoleProvider.md)
- [OrganizationManager](OrganizationManager.md), [PersonManager](PersonManager.md)
- `src/types/Role.ts` — `Role`, `RoleUpdate`
- Issue #617 — canonical-records design
- Page Audience + Roles documentation: `/view/roles`
