---
name: Managers and providers developer guide
description: How to add a manager or provider — one door per resource, config selects the implementation
dateModified: 2026-10-25
category: guides
relatedModules: [BaseManager, BaseProvider, FileManager]
---

# Managers and providers developer guide

How to add a manager or a provider. The invariant is in [guiding-framework.md](../guiding-framework.md): all code that touches a resource goes through that resource's manager.

## Standing rules

- One manager per resource. There is no second write path around it.
- Managers extend `BaseManager`. Providers extend the matching `Base*Provider`. The manager loads the provider; routes and plugins do not.
- `engine.getManager('Name')` is the address. Absent must not mean null — keep the capability addressable and make the implementation inert.
- Configuration selects the provider (`ngdpbase.<capability>.provider`) and parameterises it. It does not contain logic.
- A capability that can be left unconfigured must still work (Null, console, or an in-process default). Log the resolved provider at boot.
- Authorization and audit happen at the manager door, with an `ActorContext`. See [security-developer-guide.md](security-developer-guide.md) and [audit-developer-guide.md](audit-developer-guide.md).
- A manager whose data can appear on a page bumps its cache topic after every write, through one write helper at its door (`CacheManager.bump`). See [caching-developer-guide.md](caching-developer-guide.md).
- A manager says what state it is in through `BaseManager`, never only in the log: `markFailed` (could not start) or `markDegraded` (configured, wanted, not working) for an outage, `markNeedsAttention` when the feature works but an administrator has something to do (save the backup key, fix a mistyped value), `markDisabled` when it is deliberately off, and `markReady` / `markReadyIfDegradedBy(reason)` when it recovers. The kind is declared where the state is set, never read from the reason's wording; the admin dashboard lists outages under "subsystems not working" and the rest under "Working, but needs your attention" ([#1946](https://github.com/jwilleke/ngdpbase/issues/1946)). `preflightConfiguredPath` marks a bad path degraded for you.
- A manager whose data is a folder of files, or one file, declares it (`backupFolders()`) and writes no backup code: BackupManager backs it up, stages it in a site restore and puts it in place at the next start, in `BaseManager.initialize()`, so call `super.initialize()` before you read it ([#1985](https://github.com/jwilleke/ngdpbase/issues/1985); [BaseManager](../managers/BaseManager.md#declaring-your-data-folders), [backup and restore guide](backup-restore-guide.md#rules-for-developers-and-add-on-authors)). Nothing but BackupManager imports `src/utils/directoryBackup.ts` (`npm run lint:backup`).
- A record is written whole or not at all, and one change at a time ([#2015](https://github.com/jwilleke/ngdpbase/issues/2015)). A provider writes a file through `writeFileAtomic` (`src/utils/atomicWrite.ts`), never its own temp-then-rename: a temp name built from the pid and `Date.now()` is shared by two writes in one millisecond. A read-modify-write of one record (read, merge, write back) runs inside a `KeyedSerial` (`src/utils/keyedSerial.ts`) keyed by that record, the read included, wherever the read happens: in the provider for a patch, in the manager when it computes the new value (RoleManager's member lists, UserManager's accounts). Never write another per-key queue; an add-on takes a new one from `host.keyedSerial()` for its own records ([Change your own records one at a time](addons-developer-guide.md#change-your-own-records-one-at-a-time), [#2065](https://github.com/jwilleke/ngdpbase/issues/2065)). Accounts are built this way ([#2025](https://github.com/jwilleke/ngdpbase/issues/2025)): every read-merge-write of a user runs in one key per normalized username, and a caller whose change depends on the account as it is now passes `updateUser` a function, `(current) => updates`, which runs inside that key ([UserManager](../managers/UserManager.md#one-change-at-a-time-per-account)).
- A change completes or it does not happen, and one that does not is an error ([#2015](https://github.com/jwilleke/ngdpbase/issues/2015), operator 2026-10-23). Catching a failure to log and carry on tells an administrator a change was saved when it was not (accounts created without their role). Undo what the request already wrote, log at error level, notify admins when nobody is waiting for the answer, record the attempt as a failure in the audit (never a success, never by altering an earlier row), and throw an error the route can show. A warning is never the whole response to a change that did not happen.
- A manager that needs the site closed puts it in maintenance mode through the one door, below. It never throws to stop the boot over something an administrator can fix, and never writes its own gate. One exception: when the first boot cannot give the bootstrap admin its `admin` role, no administrator exists to fix anything, so the boot stops, removes the half-made account, and the next boot tries again ([#2015](https://github.com/jwilleke/ngdpbase/issues/2015), operator, 2026-10-23).
- Server log: domain only; audit keeps addresses. A full email address never reaches the server log: a log line names the address's domain, through `emailDomain()`, and an error that may quote an address goes through `errorForLog()` (`src/utils/emailForLog.ts`). Audit records are not the server log and keep the full address an event carries; never pass them through these helpers (operator, 2026-10-20, [#1916](https://github.com/jwilleke/ngdpbase/issues/1916)). A failed send is logged once, by EmailManager; a caller does not log the error again.

## Maintenance mode has one owner

`MaintenanceState` (`src/utils/maintenanceState.ts`), held by the Engine as `engine.maintenance`, owns maintenance mode: whether the site is in it, the reasons, the visitor message and estimate, and whether administrators may enter ([#1906](https://github.com/jwilleke/ngdpbase/issues/1906), operator 2026-10-19). `engine.blockConfiguration` is retired.

- __Enter:__ `engine.maintenance.enter(reason, { message?, estimatedDuration? })`. The reason is for administrators: write what failed and how to fix it. Pass `message` only when visitors should hear something other than the site's own maintenance message.
- __Leave:__ `engine.maintenance.leave(reason)`, with the same string, when the reason clears. The site reopens when none is left, without a restart.
- __Who uses it:__ AuditManager (`refuse-boot`), AddonsManager (a site-critical add-on that did not load), DatabaseManager (the application database cannot be opened), `app.ts` (an unusable TLS file or egress range) and the admin toggle. A new one goes through the same call.
- __Where the state lives:__ in memory on the Engine, created in its constructor, so a manager can enter it while the others are still initialising. A failure is true for one run, so it is never written into the operator's file. The admin switch is the one reason that survives a restart: the toggle also writes `ngdpbase.features.maintenance.enabled`, and `restoreSwitch` enters it again at boot.
- __What visitors see:__ the manager's message if it passed one, else `ngdpbase.features.maintenance.message` (any text an administrator sets), else the retired `ngdpbase.managers.addons-manager.site-critical.public-message` when a site set it, else the shipped message; the estimate likewise from `ngdpbase.features.maintenance.estimated-duration`. Never a reason, on the page or in `/health/readiness`.
- __Who gets in:__ a failure keeps everyone, administrators included, to `/admin`, `/login` and `/logout`, and `/health/readiness` answers 503. The admin switch alone lets administrators with `admin-system` use the whole site, when `ngdpbase.features.maintenance.allow-admins` is true.
- __What administrators see:__ every reason in the startup log and on the admin dashboard, plus whatever notification the manager sends (the add-on and database failures send a critical one).

## Files have one door

`FileManager` owns files: the file record (`FileRecord`, `src/types/File.ts`), where a file lives (public or a vault), its owner and its system-category, for every type ([#1852](https://github.com/jwilleke/ngdpbase/issues/1852), epic [#1851](https://github.com/jwilleke/ngdpbase/issues/1851), operator 2026-10-20). It is the door and, as later steps land, the only writer of files.

- __Today it reads only__, over AttachmentManager: today's attachments as file records. AttachmentManager still writes them, until FileManager takes the writes over.
- __Ask it, not around it__: code that needs "the files this user may read" calls `FileManager.list` / `get` / `findByName` with the caller's context. It asks the PDP for `asset-read` and leaves the vault rule to AttachmentManager's vault reads, so neither rule has a second home.
- __PageManager keeps pages__ and its own index for a long time (decision log, round 2); intake is ImportManager, extended, handing pages to PageManager and files to FileManager.
- Details and what is built when: [storage developer guide](storage-developer-guide.md#files-one-record-one-door), [FileManager.md](../managers/FileManager.md).

## Identity records have one door

`IdentityManager` keeps identity records, of users and contacts alike, and `OrganizationManager` keeps organizations: core's records, used by every add-on that keeps them (accounting's donors, a club's members). User, contact, identity record and profile mean what the [glossary](../GLOSSARY.md#identities) says ([#1930](https://github.com/jwilleke/ngdpbase/issues/1930), operator 2026-10-20). An add-on keeps the identity's `@id`, never its own copy.

- __Every user and every contact has one identity record.__ A user's record has the username as its `identifier`; a contact's has `person:<uuid>`, and `isReservedUsername` refuses any username with that prefix, so it can never be a user's.
- __Every user has exactly one identity record, made by `UserManager.createUser`__ ([#2037](https://github.com/jwilleke/ngdpbase/issues/2037)). A user without one (an account written straight into the user store, or one whose identity record was lost) is repaired, never refused: at start-up UserManager lists the identity records once and gives each user that has none its record, from the account's display name and email; and `IdentityManager.getByUserIdentifier`, which RoleManager's role reads and writes use, makes it on first use. Either way the record is made through `create` under the system context, one at a time per username, and recorded as `identity-manage` (`person-create`). It is made only when no identity record has that username as its `identifier`: a contact with the same email is never joined or copied (an administrator links it, below). A username with no account still fails.
- __The door.__ `create`, `update`, `delete`, `get`, `list` and `search` (name or email) on both managers, plus `OrganizationManager.people`, take the caller's context first and ask the PDP (`src/utils/contactAccess.ts`, the one rule for both): __`identity-read`__ to `list`, `search`, `get` and `people`, and the `/admin/contacts` and `/admin/organizations` views; __`identity-manage`__ to `create`, `update`, `delete` and link (operator, 2026-10-20). As shipped, `identity-read` is held by `admin` and `demo-admin` (`contact-read-access`), `identity-manage` by `admin` alone (`contact-manage-admin`); an add-on grants either to its own roles in its own policy. A refusal throws `ContactRefusedError` with the decision; a route hands it to `enforceDeny` (or `refuse` in core routes).
- __Every change is recorded__ as `identity-manage`, by the door, with the actor and the fields changed (never their values), and the kind and operation (`person-create`, `organization-update`, `person-link`, …) as the action.
- __The account lifecycle__ is UserManager's: creating, editing and deleting an account keeps its identity record in step through the door under a system context (`jobContextFromSystem`, the reason naming the account and who changed it), so a self-registration, which holds no `identity-manage`, still gets its identity record.
- __Deleting a user deletes its identity record__, including one first made for a contact and later joined to the account (operator, 2026-10-20). A record that names an identity record by `@id` must cope with it disappearing: keep what it needs to show (the name, say) on its own record as well.
- __Affiliations live on the identity record__ (`affiliation: [{ organization, role? }]`, schema.org `affiliation`). The `role` field there is the affiliation's title (Treasurer, Owner), not a role: it grants nothing ([glossary](../GLOSSARY.md#identities)). `OrganizationManager.people` reads them; the organization stores no copy.
- __A contact who signs up becomes that user, never a second identity record.__ At sign-up, when exactly one contact has the new user's email and email links are available, IdentityManager mails an "Is this you?" link; the new user, signed in, confirms it on `/contacts/link/confirm`. An administrator can also link by hand on `/admin/contacts` (`linkAccount`, which also asks `user-edit`). Either way the contact's identity record keeps its `@id` and takes the username; the identity record made for the new user is folded into it, its role memberships move with it (`RoleManager.moveMemberships`), and it is removed.
- __Values are configuration:__ `ngdpbase.application.persons.search.limit` and `ngdpbase.application.organization.search.limit` (50) when a caller gives no limit, and `ngdpbase.application.persons.link-offer.ttl-minutes` (30) for the sign-up link.
- __Only users act__ (operator, 2026-10-23, [#2018](https://github.com/jwilleke/ngdpbase/issues/2018); user, contact, identity record and profile as defined in the [glossary](../GLOSSARY.md#identities)). A contact cannot sign in and never acts. A user may always read and manage their own profile, including their own identity record, under `profile-manage`, which every user holds: the same rule as `/profile`. Reading any other identity record needs `identity-read`, changing one `identity-manage`. Core's own work (resolving roles on each request, the account lifecycle) passes the system context with a reason. Built: `requireRecordAccess` in `src/utils/contactAccess.ts`, which compares the context's username with the record's `identifier`, never a role.
- __No unchecked reads.__ Every lookup takes a context: `getById`, `getByIdentifier` and `getByUserIdentifier` here, `OrganizationManager.getById` / `getByFile`, `RoleManager.hasRole` / `resolveUserRoles` / `getById`, and `AssetManager.getById` / `getAssetsForPage` (`asset-read`). The system context (origin boot or schedule, naming the system principal, with no token, share or proxy) is recognised by its fields and allowed without a policy evaluation, so resolving roles on every request stays cheap; it never reaches a request. Built ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)); `npm run lint:context` fails a call with the context left out, in core and add-ons alike.
- The calls an add-on makes are in the [add-ons guide](addons-developer-guide.md#contacts-and-identity-records).

## Requests for review have one door

`ReviewManager` keeps the requests that wait for someone's decision, for every add-on ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072), [ReviewManager.md](../managers/ReviewManager.md)). An add-on files one through `host.reviews.fileRequest` and registers the handler that carries an approval out; nothing builds a queue of its own.

- __Who decides__ is a permission the request names, asked of the PDP with the caller's context; the holders are notified through `usersHolding`.
- __Complete or not:__ the handler runs with the decider's context, in their request; a failure leaves the request open with the reason shown, a success marks it approved with the handler's summary.
- __Stored__ in core's application database, and only while it is encrypted; `ngdpbase.reviews.retention-days`, `list-limit` and `details-max-bytes` are its values.

## How to add a manager

- 1 Scaffold from [docs/templates/Manager-Template.md](../templates/Manager-Template.md).
- 2 Register it on `WikiEngine` in dependency order.
- 3 Add `docs/managers/YourManager.md` with `code: src/managers/YourManager.ts` in the same commit. The index in [Developer-Documentation.md](../Developer-Documentation.md) is generated from that frontmatter.
- 4 If it stores bytes, add a provider that extends the right `Base*Provider` and a Null or file default.

## How to add a provider

- 1 Scaffold from [docs/templates/Provider-Template.md](../templates/Provider-Template.md).
- 2 Bind it with `ngdpbase.<capability>.provider` and `ngdpbase.<capability>.provider.<name>.*`.
- 3 Load it with a dynamic `import()` inside the factory, not a top-level import.

## How you know you are done

- `npm test` covers the new door (authorize, audit, inert default).
- `docs/managers/YourManager.md` (or `docs/providers/…`) exists with a `code:` field.
- Its data folders are declared in `backupFolders()`, and the [backup and restore guide](backup-restore-guide.md)'s inventory row says so.

## See also

- [guiding-framework.md](../guiding-framework.md)
- [architecture/MANAGERS-OVERVIEW.md](../architecture/MANAGERS-OVERVIEW.md)
- [BaseManager](../managers/BaseManager.md)
- [BaseProvider](../providers/BaseProvider.md)
- [configuration-developer-guide.md](configuration-developer-guide.md)

## Known gaps

- [#1211](https://github.com/jwilleke/ngdpbase/issues/1211)
- [#1134](https://github.com/jwilleke/ngdpbase/issues/1134)
- [#1135](https://github.com/jwilleke/ngdpbase/issues/1135)
- [#1109](https://github.com/jwilleke/ngdpbase/issues/1109)
- [#1852](https://github.com/jwilleke/ngdpbase/issues/1852): FileManager reads only; files are still written through AttachmentManager. Its gaps are in the [storage developer guide](storage-developer-guide.md#known-gaps).
- [#1916](https://github.com/jwilleke/ngdpbase/issues/1916): EmailManager reports every failed send ([EmailManager](../managers/EmailManager.md#when-a-send-fails)), but the count and the open notice are held in memory, so a restart starts a new notice. Second-factor enrolment shows the transport's error text to the user who asked.
- [#1930](https://github.com/jwilleke/ngdpbase/issues/1930): contacts. A sign-up link offer is held in memory, so a restart drops it (an administrator then links by hand), and nothing is offered when several contacts share the address. A refusal at the door is not yet recorded as `authorization-deny` ([#1825](https://github.com/jwilleke/ngdpbase/issues/1825)). Deleting an organization leaves affiliations naming it. `search` reads every record (no index). The JSON-LD export does not yet write `affiliation` as a schema.org `OrganizationRole`.
- [#2015](https://github.com/jwilleke/ngdpbase/issues/2015): `KeyedSerial` orders writes within one server process only; two processes on one data folder can still race. `IdentityManager`'s account join reads two identity records and replaces one without it, and a failure after its role move (the replace, the delete of the folded identity record) does not move the roles back. A boot-time grant that missed an account is not retried at the next start.
- [#2025](https://github.com/jwilleke/ngdpbase/issues/2025): the install reset (`InstallService`, "remove admin user") still reads `users.json`, deletes the admin and writes the file back itself, outside UserManager and its key. `POST /profile` reads the account to check `profileLocked` before its `updateUser`, outside the key: an account locked between the two can still have its own display name or email changed once.
- [#1906](https://github.com/jwilleke/ngdpbase/issues/1906): editing `ngdpbase.features.maintenance.enabled` on the configuration screen, rather than with the toggle, takes effect at the next restart. AuditManager and the TLS and egress checks send no notification of their own; their reasons are on the admin dashboard and in the log.
