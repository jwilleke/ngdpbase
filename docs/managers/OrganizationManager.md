---
name: OrganizationManager
description: Canonical Organization records (#617) — one file per organization, pluggable via OrganizationProvider
dateModified: '2026-10-25'
category: managers
code: src/managers/OrganizationManager.ts
---

# OrganizationManager

Canonical core record for Organization entities (#617). One file per organization on disk; read/write goes through an injected `OrganizationProvider`. Caches install-anchor lookups + by-id / by-file lookups for read-hot paths (`UserManager.syncPersonOnCreate`, `UserManager.applyRoleDiff`).

## Why this exists

Pre-#617, organization records were ad-hoc (sometimes a list in config, sometimes derived from users). Centralizing them as first-class records lets `Role`, identity records (`Person`), and per-organization audit trails reference a stable Organization ID instead of a string name.

## The install anchor

One organization is the __anchor__: `UserManager` resolves `Person.memberOf` and every Role membership through `getInstallOrg()`. Without an anchor, `syncRoleAdd` cannot attach an identity record to a Role, so __no user can hold any role__ — including `admin` on the default admin account.

`getInstallOrg()` resolves it in three tiers (#1027):

1. __`ngdpbase.application.organization.file` names it.__ What the install wizard writes.
2. __No key, exactly one record exists → adopt it.__ A single-organization install has no ambiguity about which one anchors it; requiring a config key to state the obvious is what left headless deployments silently unable to assign roles.
3. __Nothing at all → seed one__ from `ngdpbase.application.base-url` and `ngdpbase.application-name`, via `seedFromConfig()` — the same path the install wizard uses, so a seeded instance and a wizard-installed one are indistinguishable afterwards. Minimal by design: no address or contact points, because inventing them would put fabricated data on a possibly-public instance.

__Several records and no key resolves to `null`, deliberately.__ Choosing arbitrarily could bind every role to the wrong organization, and seeding another would add to the ambiguity. It warns and declines.

The result is cached — including a `null` — so resolution happens once per process.

Two things it never does: __write the config key back__ (instance config is a read-only mount on containerised deployments, so any strategy depending on persisting a key fails exactly where this problem bites), and __rewrite an adopted record's `@id`__ (Role records reference the organization by `@id`; normalising even a trailing slash would orphan every existing role).

## The organizations door

OrganizationManager is the door for organizations ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930)): `create`, `update`, `delete`, `get`, `list`, `search` and `people` take the caller's context first, ask `identity-read` to read and `identity-manage` to change, and record each change as the `identity-manage` audit event. `people(ctx, id)` returns `[{ person, affiliation }]`, one entry per affiliation with the organization, past and future ones included, each `affiliation` a schema.org `OrganizationRole` (title in `roleName`, dates) ([#2039](https://github.com/jwilleke/ngdpbase/issues/2039)). It asks `IdentityManager.search(ctx, { affiliation })`, which owns searching identities and answers who holds one today; the organization stores no copy. An affiliation with the organization `getInstallOrg` returns is a fact, set only under `identity-manage`. `getById(ctx, id)` and `getByFile(ctx, filename)` take the caller's context too: `identity-read`, or the system context for core's own reads, without a policy evaluation ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). `getInstallOrg` (the site's own anchor Organization, named in configuration) and `seedFromConfig` (boot) take none. The rules are in the [managers guide](../guides/managers-developer-guide.md#identity-records-have-one-door); the calls an add-on makes are in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records).

## Provider Pattern

`OrganizationProvider` is the storage abstraction. The default implementation is [FileOrganizationProvider](../providers/FileOrganizationProvider.md) (one JSON file per org under `data/organizations/`). Other backends could swap in (database, CRM API) without affecting the manager.

## Backup and restore

Organization records are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.application.organization.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.organizations.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FileOrganizationProvider](../providers/FileOrganizationProvider.md)
- [IdentityManager](IdentityManager.md), [RoleManager](RoleManager.md) — sibling canonical-record managers
- `src/types/Organization.ts` — `Organization`, `OrganizationUpdate`, `PostalAddress`, `ContactPoint`, `ContactPointEntry` (a `contactPoint[]` entry: a ContactPoint or a PostalAddress)
- Issue #617 — original canonical-records design
- Issue #620 — caching hot-path lookups
