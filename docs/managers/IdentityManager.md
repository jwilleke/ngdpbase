---
name: IdentityManager
description: Identity records (#617) for every user and contact — kept apart from sign-in, shared across addons
dateModified: '2026-10-26'
category: managers
code: src/managers/IdentityManager.ts
---

# IdentityManager

Keeps identity records (#617): one for every user and one for every contact. Terms as in the [glossary](../GLOSSARY.md#identities): a user is a digital identity the site holds credentials for; a contact has none, cannot sign in and never acts; an identity record is a record, never something that acts.

## Why this exists

Pre-#617, identity data was scattered: author names on pages, contact entries in some addons, organization members in others. Centralizing as first-class records lets addons (person-contacts, journal, calendar) share identity records without re-implementing their storage.

## Names: what was renamed, what was not

IdentityManager was `PersonManager` until [#2038](https://github.com/jwilleke/ngdpbase/issues/2038) (step 3 of the [identity model](../planning/identity-model.md)). It registers as `IdentityManager`. For one release, `engine.getManager('PersonManager')` still returns it and logs a deprecation warning once, naming the caller; the `PersonManager` type in `@jwilleke/ngdpbase-types` is a deprecated alias of `IdentityManager`. The permissions it asks were renamed with it: `identity-read` was `contact-read`, `identity-manage` was `contact-manage`; a policy or token naming an old name is read as the new one, with a warning once per policy ([access policies](../access-policies.md)).

What is stored keeps its name, so existing data and settings need nothing: the folder `data/persons/` and its key `ngdpbase.application.persons.*`, the provider (`PersonProvider`, `FilePersonProvider`), the `Person` types, the identifier `person:<uuid>` of a contact's identity record, the audit actions (`person-create`, `person-link`, …), the `PersonManager` entry and `<stem>.persons.tar` archive in a backup (so an older backup restores, and an older site can restore a new one), and the ids of the shipped policies (`contact-read-access`, `contact-manage-admin`, so an operator's override of them still merges). Audit records already written as `contact-manage` stay as they are; new ones are `identity-manage`.

## The identity records door

IdentityManager is the door for identity records, of users and contacts alike ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930)): `create`, `update`, `delete`, `get`, `list`, `search` and `linkAccount` take the caller's context first, ask `identity-read` to read and `identity-manage` to change (`linkAccount` also `user-edit`), and record each change as the `identity-manage` audit event. A user reading or changing their own identity record, part of their profile, is checked against `profile-manage` instead; a contact cannot sign in and never acts ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)).

Every lookup takes the caller's context first too ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)): `getById(ctx, id)`, `getByIdentifier(ctx, identifier)` and `getByUserIdentifier(ctx, username)`. The decision is `requireRecordAccess` in `src/utils/contactAccess.ts`, the one rule for this door and OrganizationManager's:

- the caller's own identity record (the context's username is the record's `identifier`): `profile-manage`, which every user holds;
- anyone else's, a contact's included: `identity-read` to read, `identity-manage` to change;
- core's own reads: the system context (`systemContext(engine, reason)`, origin boot or schedule, naming the system principal, with no token, share or proxy), allowed without a policy evaluation, so resolving roles on every request stays cheap.

__A user missing its identity record__ ([#2037](https://github.com/jwilleke/ngdpbase/issues/2037)). Every user has exactly one identity record, made when `UserManager.createUser` makes the account. `getByUserIdentifier(ctx, username)` returns it and, when the user has none, makes it: the caller's read is decided as above, then the record is made through `create` under the system context (the reason names the account and the caller), from the account's display name and email, and recorded as `identity-manage` (`person-create`). One at a time per username, so lookups at once make one record. Null when there is no account by that name. It never makes a second record: one is made only when no identity record has the username as its `identifier`, and a contact with the same email is left alone for an administrator to link (`linkAccount`). RoleManager's role reads and writes, and UserManager's start-up repair, use it.

"Own" is decided by comparing the context's username with the record, never from a role. A refusal throws `ContactRefusedError`. Reads are not recorded; changes are, as `identity-manage`. `update` follows the same rule: a user changes their own identity record under `profile-manage`; `delete` always asks `identity-manage`. A contact's identity record has the identifier `person:<uuid>`. Only users hold roles: a contact is refused as a role member, decided by RoleManager from this identifier and the account it names ([#2040](https://github.com/jwilleke/ngdpbase/issues/2040), [RoleManager](RoleManager.md#only-users-are-members)). Joining a later sign-up (`offerSignUpLink`, `signUpLinkOffer`, `confirmSignUpLink`, `declineSignUpLink`) and the rules for all of it are in the [managers guide](../guides/managers-developer-guide.md#identity-records-have-one-door); the calls an add-on makes are in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records).

## Affiliations

An affiliation is a schema.org `OrganizationRole` on the identity record ([#2039](https://github.com/jwilleke/ngdpbase/issues/2039), step 4 of the [identity model](../planning/identity-model.md)): `{ '@type': 'OrganizationRole', memberOf: { '@id' }, roleName?, startDate?, endDate? }`. `roleName` is the affiliation's title, free text; it is never a role and grants nothing. `create` and `update` check each entry (the organization exists, dates are `YYYY-MM-DD`, the start not after the end) and decide who may set it: one with the site's own organization (`OrganizationManager.getInstallOrg()`) is a fact and needs `identity-manage`; one with any other organization is a claim, which a user may also set on their own record under `profile-manage`. `search(ctx, { affiliation: { memberOf, title?, current? } })` finds a group, users and contacts alike, under `identity-read`. Records are kept in memory between writes, so lists and searches read no file per record.

The shape before #2039, `{ organization, role? }`, is converted when read, accepted on writes for one release, and rewritten on disk once at start-up (`initialize`): only records still holding an old entry, each recorded as `identity-manage` (`person-update`, field `affiliation`) under the system context, with every other field kept; a second start finds nothing to do. The rules are in the [managers guide](../guides/managers-developer-guide.md#identity-records-have-one-door); the calls in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records).

## A user's own contact details

`updateContactDetails(ctx, id, input)` ([#2073](https://github.com/jwilleke/ngdpbase/issues/2073)) sets the parts of an identity record a user keeps on `/profile`: `givenName` and `familyName`, phones, the emergency contact, the home address (`address`) and the `mailing` address, `knowsLanguage`, `image` and `sameAs`. A part left out of `input` is not touched; a text given empty is removed. The input shape is `ContactDetailsInput` in `src/types/Person.ts`.

- __Phones are stored in E.164__ (`+14155552671`), the extension apart in the ContactPoint's `extension` field. Each phone is read with its own country (ISO 3166-1 alpha-2), or `ngdpbase.application.persons.default-country` (shipped `US`) when none is given; a number typed with a leading `+` keeps its own country code. Parsing is [libphonenumber-js](https://www.npmjs.com/package/libphonenumber-js) (`src/utils/phoneNumbers.ts`): the maintained JavaScript port of Google's libphonenumber metadata, so the per-country numbering rules are not kept here. A number it cannot read as valid is refused.
- __Merging.__ Each phone takes the place of the record's first `ContactPoint` of its `contactType` (`home`, `mobile`, `business` for work, `other`), the emergency contact the first `emergency` ContactPoint (`name`, `telephone`, `email`), the mailing address the first `mailing` PostalAddress; each keeps that entry's other fields. Every other entry, an add-on's included (a `business` PostalAddress, an `agent`), is kept as it is. An entry left with no name, phone, email or address is dropped; an address's country alone does not keep it.
- __Countries__ are ISO 3166-1 alpha-2 codes, checked against libphonenumber's list; an address with content gets the default country when none is given. __Languages__ are stored as ISO 639-1 tags (`es`), given by name ("Spanish") or tag; names are the runtime's (`Intl.DisplayNames`, `src/utils/languages.ts`). `image` and `sameAs` must be http or https web addresses.
- __Everything is checked before anything is written.__ A bad part throws `ContactDetailsInvalidError` with its `part` (a phone's `contactType`, `emergency`, `address`, `mailing`, `knowsLanguage`, `image`, `sameAs`) and `field`; the message names the rule, never the value, since it reaches URLs and logs. The access check comes first, so a caller with no right to the record gets the refusal, not a check of what it gave.
- __Access and the record__ are `update`'s: own record under `profile-manage`, anyone else's under `identity-manage`, recorded as `person-update` naming only the fields that changed, never their values. Nothing changed, nothing is written or recorded.
- `defaultCountry()` returns the configured default country, for a form's dropdowns. `checkContactDetails(input)` runs the same checks and writes nothing, for a caller that must write something else first.

The `/profile` "Contact details" card saves through it (`POST /profile/contact-details`), always for the signed-in user's own record; the form's shape is `src/routes/profileContactDetails.ts`. The card's name and email are the account's: they go through `UserManager.updateUser`, which keeps the identity record's `name` and `email` in step; a changed email asks `account-security`, and a shared account's (`profileLocked`) name and email stay an administrator's. The card checks everything first (`checkContactDetails`), writes the account change, and writes the identity record only after it succeeds; if that last write fails, the page says the name or email was saved and the rest was not. Not editable there: `@id`, the username, affiliations (a title at the site's own organization) and roles.

`update` itself still stores what it is given: a phone an add-on writes through `update` is not converted to E.164 (shown on the card as stored until the user saves it again).

## Provider Pattern

`PersonProvider` is the storage abstraction. Default: [FilePersonProvider](../providers/FilePersonProvider.md) (one JSON file per identity record under `data/persons/`).

## Read-Hot Paths

Per-request hot paths cache by-identifier and by-key lookups (#620):

- `RoleManager.resolveUserRoles → getByUserIdentifier` (cached like `getByIdentifier`; it reaches UserManager only for a username that has no identity record), under the system context from `PolicyInformationPoint.subjectFor` ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)): recognised by its fields, no policy evaluation
- Various consumer-side `identityManager.getByEmail` / `getByUuid` calls

## Backup and restore

Identity records are in every backup ([#1876](https://github.com/jwilleke/ngdpbase/issues/1876)): the manager declares its folder (`ngdpbase.application.persons.storagedir`) in `backupFolders()` and writes no backup code ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985)). BackupManager writes it as `<stem>.persons.tar` beside the backup document, streamed, the files as they are, and the manager's entry names the archive. A site restore stages it (`restoreIsStaged()` is true for a manager that declares folders): BackupManager extracts the archive to `<folder>.staged` and never writes into the folder; at the next start, in `BaseManager.initialize()` before the manager reads the folder, the staged copy takes its place (the old one kept as `<folder>.pre-restore`) only when every part of the site restore goes in. Details in the [backup and restore guide](../guides/backup-restore-guide.md#the-staged-site-restore-1876-slice-1).

## See Also

- [FilePersonProvider](../providers/FilePersonProvider.md)
- [OrganizationManager](OrganizationManager.md), [RoleManager](RoleManager.md)
- `src/types/Person.ts` — `Person`, `PersonAffiliation`, `PersonInput`, `PersonUpdate`; `contactPoint[]` entries are `ContactPointEntry` (a `ContactPoint` or a `PostalAddress`), stored and returned as given — the shape is in the [add-ons guide](../guides/addons-developer-guide.md#contacts-and-identity-records)
- `src/utils/contactAccess.ts` — the `identity-read` / `identity-manage` decision, the own-record and system-context rule (`requireRecordAccess`, `isSystemWork`), the record, `ContactRefusedError`
- Issue #617 — canonical-records design
- Issue #602 — `person-contacts` addon proposal
