---
name: RoleManager
description: Canonical Role records — one file per (organization, namedPosition) pair (#617 follow-up)
dateModified: '2026-10-24'
category: managers
code: src/managers/RoleManager.ts
---

# RoleManager

Canonical store for role membership. A role is a set of permissions, and only users hold roles ([glossary](../GLOSSARY.md#identities)). Each record uses the schema.org `OrganizationRole` type, one file per `(organization, namedPosition)` pair. Members of a role are stored within the role record, so "who holds role X at org Y" is one read.

Which roles __exist__ is a declaration in configuration (`ngdpbase.roles.definitions`), read through `ConfigurationManager`. What a role __permits__ is the access policies. RoleManager owns the third fact: __who holds which role__ — the roles (`admin`, `editor`, …) on the install's anchor Organization. RoleManager holds nothing else: a title such as "Board President at Acme Corp" is not a role but an affiliation (a title within an organization) on the identity record, and it grants nothing. No title is kept as a role record.

## Membership

Moved here from `UserManager` in [#1431](https://github.com/jwilleke/ngdpbase/issues/1431) step 12. Callers hold usernames; `IdentityManager` maps a username to the identity record's `@id` a role record lists.

Who holds a role is read about a named account, so every read takes the caller's context first ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). `resolveUserRoles` and `hasRole` read the account's identity record through `IdentityManager.getByUserIdentifier(ctx, username)`, which makes it when the user has none ([#2037](https://github.com/jwilleke/ngdpbase/issues/2037)): a user about themselves under `profile-manage`, about anyone else under `identity-read`. A refusal is thrown as `ContactRefusedError`, never answered as "no roles". Core's own reads pass the system context (`systemContext(engine, reason)`), allowed without a policy evaluation: `PolicyInformationPoint.subjectFor` on every request, the idle-timeout check in `app.ts`, `UserManager`'s account lifecycle, its user search's role filter and the contact-form recipient, the user-management pages after their `user-read` decision, and the install reset. An add-on job passes its job context: on its schedule that is the system context; started from a request, it is the requester's.

| Method | For |
| --- | --- |
| `resolveUserRoles(ctx, username)` | the user's role names, live; `[]` when there is no account by that username or no role record |
| `hasRole(ctx, username, roleName)` | the same question for one role — a lookup, not an access decision |
| `getById(ctx, id)` | one role record; its members are identity records, so `identity-read`, or the system context |
| `assignRole(username, roleName, ctx)` / `removeRole(…)` | one role, for an existing account and a declared role; recorded as `user-edit` |
| `applyRoleDiff(username, oldRoles, newRoles)` | what `UserManager` calls when an account is created or edited; the account write records the audit event |
| `removeAllMemberships(username)` | a deleted account's identity record leaves every role |
| `grantToEveryAccountOnce(roleName, usernames, ctx)` | a role every account must hold, given at boot to the accounts that predate it — once: the role's record not existing is the record that it was never given, so a later removal stands; each grant recorded as `user-edit` under the system context ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)) |

A role change completes or it does not happen (operator, 2026-10-23, [#2015](https://github.com/jwilleke/ngdpbase/issues/2015)). One that cannot be made, whatever the cause (a failed save, no IdentityManager, no account by that username, no anchor Organization; an account missing its identity record gets it first, [#2037](https://github.com/jwilleke/ngdpbase/issues/2037)), is always an error, never a warning: the changes of that request already made are undone, it is logged at error level, admins get an error notification, and a `RoleChangeError` (`src/utils/roleChangeError.ts`) is thrown, naming the change and, when an administrator can fix it, the reason. If an undo itself fails, the error names what is still in effect.

- `assignRole` / `removeRole` record the attempt as a `user-edit` either way, with `result: failure` when it was refused.
- `UserManager.createUser` (admin form, self-registration, outside sign-in) and `createDefaultAdmin`: the account and its identity record are taken back, so a retry finds the username and email free, and the creation is recorded as a failed `user-create`. A bootstrap admin whose role cannot be given stops that boot; the store is empty again, so the next boot tries again.
- `UserManager.updateUser`: the role change is made first; refused, nothing of the edit is written and it is recorded as a failed `user-edit`. When the account write fails after it, the roles are put back.
- `UserManager.deleteUser`: `removeAllMemberships` goes first; refused, the account is not deleted and the delete is recorded as failed. It returns an undo that gives every role back when the delete fails afterwards. An account with no identity record holds no role, so there is nothing to remove.
- `moveMemberships` (a contact join) is all or nothing and runs before the identity records change, so a refused move refuses the join.
- `grantToEveryAccountOnce` (boot) gives the role to every account it can. Each one it cannot is recorded as a failed `user-edit`, and the misses are one error notification naming the accounts. Nobody asked, so the boot goes on, and the role is not tried again at the next start: an administrator assigns it by hand.

Membership changes to one role record run one at a time, the read included (`KeyedSerial`, `src/utils/keyedSerial.ts`), so concurrent changes all land. The caches are not refilled by a read that started before a write.

## What a record holds

Identity (`@id`, `namedPosition`, `organization`) and `member` — nothing configuration already says. Records written before #1431 step 1 also carried a copy of the role's catalogue entry (`roleName`, `description`, `issystem`, `icon`, `color`) and a `permissions` list under `additionalProperty`, taken at create time and never updated. At every start RoleManager strips that copy from any record that still has it and logs how many it cleaned; on a clean store it does nothing (operator, 2026-09-21).

## Why this exists

Follow-up to #617. Once organizations and identity records became first-class records, role bindings needed their own home so the role couldn't be lost if the user's account changed.

## Provider Pattern

`RoleProvider` is the storage abstraction. Default: [FileRoleProvider](../providers/FileRoleProvider.md) (one JSON per role under `data/roles/`).

## Backup and restore

Role records (membership) are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.application.roles.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.roles.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FileRoleProvider](../providers/FileRoleProvider.md)
- [OrganizationManager](OrganizationManager.md), [IdentityManager](IdentityManager.md)
- `src/types/Role.ts` — `Role`, `RoleUpdate`
- Issue #617 — canonical-records design
- Page Audience + Roles documentation: `/view/roles`
