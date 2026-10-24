---
name: PersonManager
description: Canonical Person records (#617) — decoupled from User authentication identity, shared across addons
dateModified: '2026-10-24'
category: managers
code: src/managers/PersonManager.ts
---

# PersonManager

Keeps identity records (#617): one for every user and one for every contact. Terms as in the [glossary](../GLOSSARY.md#identities): a user is a digital identity the site holds credentials for; a contact has none, cannot sign in and never acts; an identity record is a record, never something that acts.

## Why this exists

Pre-#617, identity data was scattered: author names on pages, contact entries in some addons, organization members in others. Centralizing as first-class records lets addons (person-contacts, journal, calendar) share identity records without re-implementing their storage.

## The contacts door

PersonManager is the door for identity records, of users and contacts alike ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930)): `create`, `update`, `delete`, `get`, `list`, `search` and `linkAccount` take the caller's context first, ask `contact-read` to read and `contact-manage` to change (`linkAccount` also `user-edit`), and record each change as the `contact-manage` audit event. A user reading or changing their own identity record, part of their profile, is checked against `profile-manage` instead; a contact cannot sign in and never acts ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)).

Every lookup takes the caller's context first too ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)): `getById(ctx, id)`, `getByIdentifier(ctx, identifier)` and `getByUserIdentifier(ctx, username)`. The decision is `requireRecordAccess` in `src/utils/contactAccess.ts`, the one rule for the contacts doors:

- the caller's own identity record (the context's username is the record's `identifier`): `profile-manage`, which every user holds;
- anyone else's, a contact's included: `contact-read` to read, `contact-manage` to change;
- core's own reads: the system context (`systemContext(engine, reason)`, origin boot or schedule, naming the system principal, with no token, share or proxy), allowed without a policy evaluation, so resolving roles on every request stays cheap.

"Own" is decided by comparing the context's username with the record, never from a role. A refusal throws `ContactRefusedError`. Reads are not recorded; changes are, as `contact-manage`. `update` follows the same rule: a user changes their own identity record under `profile-manage`; `delete` always asks `contact-manage`. A person with no account has the identifier `person:<uuid>`. Joining a later sign-up (`offerSignUpLink`, `signUpLinkOffer`, `confirmSignUpLink`, `declineSignUpLink`) and the rules for all of it are in the [managers guide](../guides/managers-developer-guide.md#contacts-have-one-door); the calls an add-on makes are in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records).

## Provider Pattern

`PersonProvider` is the storage abstraction. Default: [FilePersonProvider](../providers/FilePersonProvider.md) (one JSON file per identity record under `data/persons/`).

## Read-Hot Paths

Per-request hot paths cache by-identifier and by-key lookups (#620):

- `RoleManager.resolveUserRoles → getByIdentifier`, under the system context from `PolicyInformationPoint.subjectFor` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)): recognised by its fields, no policy evaluation
- Various consumer-side `personManager.getByEmail` / `getByUuid` calls

## Backup and restore

Person records are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.application.persons.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.persons.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FilePersonProvider](../providers/FilePersonProvider.md)
- [OrganizationManager](OrganizationManager.md), [RoleManager](RoleManager.md)
- `src/types/Person.ts` — `Person`, `PersonAffiliation`, `PersonInput`, `PersonUpdate`; `contactPoint[]` entries are `ContactPointEntry` (a `ContactPoint` or a `PostalAddress`), stored and returned as given — the shape is in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records)
- `src/utils/contactAccess.ts` — the `contact-read` / `contact-manage` decision, the own-record and system-context rule (`requireRecordAccess`, `isSystemWork`), the record, `ContactRefusedError`
- Issue #617 — canonical-records design
- Issue #602 — `person-contacts` addon proposal
