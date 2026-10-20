---
name: PersonManager
description: Canonical Person records (#617) — decoupled from User authentication identity, shared across addons
dateModified: '2026-10-20'
category: managers
code: src/managers/PersonManager.ts
---

# PersonManager

Canonical core record for Person entities (#617). A Person is a real-world individual; a `User` is an authentication identity. Many users have an associated person, but not every person has a user account (e.g. people referenced as authors, contacts, or members of organizations who don't log in).

## Why this exists

Pre-#617, person-shaped data was scattered: author names on pages, contact entries in some addons, organization members in others. Centralizing as first-class records lets addons (person-contacts, journal, calendar) share the identity without re-implementing person storage.

## The contacts door

PersonManager is the door for persons, with or without an account ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930)): `create`, `update`, `delete`, `get`, `list`, `search` and `linkAccount` take the caller's context first, ask `contact-manage`, and record each change as the `contact-manage` audit event. A person with no account has the identifier `person:<uuid>`. Joining a later sign-up (`offerSignUpLink`, `signUpLinkOffer`, `confirmSignUpLink`, `declineSignUpLink`) and the rules for all of it are in the [managers guide](../guides/managers-developer-guide.md#contacts-have-one-door); the calls an add-on makes are in the [add-ons guide](../guides/addons-developer-guide.md#contacts-persons-and-organizations).

## Provider Pattern

`PersonProvider` is the storage abstraction. Default: [FilePersonProvider](../providers/FilePersonProvider.md) (one JSON file per person under `data/persons/`).

## Read-Hot Paths

Per-request hot paths cache by-identifier and by-key lookups (#620):

- `RoleManager.resolveUserRoles → getByIdentifier`
- Various consumer-side `personManager.getByEmail` / `getByUuid` calls

## Backup and restore

Person records are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): `backup()` writes the folder (`ngdpbase.application.persons.storagedir`) as `<stem>.persons.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive (`src/utils/directoryBackup.ts`). `restore()` is staged (`restoreIsStaged()`): it extracts the archive to `<folder>.staged` as part of a site restore and never writes into the folder; at the next start, before anything reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FilePersonProvider](../providers/FilePersonProvider.md)
- [OrganizationManager](OrganizationManager.md), [RoleManager](RoleManager.md)
- `src/types/Person.ts` — `Person`, `PersonAffiliation`, `PersonInput`, `PersonUpdate`
- `src/utils/contactAccess.ts` — the `contact-manage` decision and record, `ContactRefusedError`
- Issue #617 — canonical-records design
- Issue #602 — `person-contacts` addon proposal
