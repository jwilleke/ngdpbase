---
name: PersonManager
description: Canonical Person records (#617) — decoupled from User authentication identity, shared across addons
dateModified: '2026-05-28'
category: managers
code: src/managers/PersonManager.ts
---

# PersonManager

Canonical core record for Person entities (#617). A Person is a real-world individual; a `User` is an authentication identity. Many users have an associated person, but not every person has a user account (e.g. people referenced as authors, contacts, or members of organizations who don't log in).

## Why this exists

Pre-#617, person-shaped data was scattered: author names on pages, contact entries in some addons, organization members in others. Centralizing as first-class records lets addons (person-contacts, journal, calendar) share the identity without re-implementing person storage.

## Provider Pattern

`PersonProvider` is the storage abstraction. Default: [FilePersonProvider](../providers/FilePersonProvider.md) (one JSON file per person under `data/persons/`).

## Read-Hot Paths

Per-request hot paths cache by-identifier and by-key lookups (#620):

- `UserManager.resolveUserRoles → getByIdentifier`
- Various consumer-side `personManager.getByEmail` / `getByUuid` calls

## See Also

- [FilePersonProvider](../providers/FilePersonProvider.md)
- [OrganizationManager](OrganizationManager.md), [RoleManager](RoleManager.md)
- `src/types/Person.ts` — `Person`, `PersonUpdate`
- Issue #617 — canonical-records design
- Issue #602 — `person-contacts` addon proposal
