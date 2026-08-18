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

## The install anchor

One organization is the __anchor__: `UserManager` resolves `Person.memberOf` and every Role membership through `getInstallOrg()`. Without an anchor, `syncRoleAdd` cannot attach a Person to a Role, so __no user can hold any role__ — including `admin` on the default admin account.

`getInstallOrg()` resolves it in three tiers (#1027):

1. __`ngdpbase.application.organization.file` names it.__ What the install wizard writes.
2. __No key, exactly one record exists → adopt it.__ A single-organization install has no ambiguity about which one anchors it; requiring a config key to state the obvious is what left headless deployments silently unable to assign roles.
3. __Nothing at all → seed one__ from `ngdpbase.application.base-url` and `ngdpbase.application-name`, via `seedFromConfig()` — the same path the install wizard uses, so a seeded instance and a wizard-installed one are indistinguishable afterwards. Minimal by design: no address or contact points, because inventing them would put fabricated data on a possibly-public instance.

__Several records and no key resolves to `null`, deliberately.__ Choosing arbitrarily could bind every role to the wrong organization, and seeding another would add to the ambiguity. It warns and declines.

The result is cached — including a `null` — so resolution happens once per process.

Two things it never does: __write the config key back__ (instance config is a read-only mount on containerised deployments, so any strategy depending on persisting a key fails exactly where this problem bites), and __rewrite an adopted record's `@id`__ (Role records reference the organization by `@id`; normalising even a trailing slash would orphan every existing role).

## Provider Pattern

`OrganizationProvider` is the storage abstraction. The default implementation is [FileOrganizationProvider](../providers/FileOrganizationProvider.md) (one JSON file per org under `data/organizations/`). Other backends could swap in (database, CRM API) without affecting the manager.

## See Also

- [FileOrganizationProvider](../providers/FileOrganizationProvider.md)
- [PersonManager](PersonManager.md), [RoleManager](RoleManager.md) — sibling canonical-record managers
- `src/types/Organization.ts` — `Organization`, `OrganizationUpdate`, `PostalAddress`, `ContactPoint`
- Issue #617 — original canonical-records design
- Issue #620 — caching hot-path lookups
