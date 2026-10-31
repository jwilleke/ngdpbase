---
name: Audit developer guide
description: How to add or change an audit event — the configuration entry, the names module, the emitter, the on-failure rule, the actor, the tests, and the checks that fail
dateModified: 2026-10-31
category: guides
relatedModules: [AuditManager, FileAuditProvider, DatabaseAuditProvider]
---

# Audit developer guide

What a developer has to do so that an action leaves a record. The decisions behind this are in [audit-posture.md](../audit-posture.md); this page is the practice.

## The three parts of an event

| Part | Where | Owns |
| --- | --- | --- |
| The declaration | an entry in `ngdpbase.permissions.definitions`, its `audit` field (#1638). An event that records something nobody is granted (`system-start`, `authentication-failed`, `job-failed`) is an entry with `"grantable": false` | The name, `on-failure` (`refuse` or `continue`), `enabled`, `description`. Configuration is authoritative; an operator may change any of it and the change is itself recorded. |
| The name in code | `src/utils/auditEventNames.generated.ts`, generated from the catalog (#1638) | Never written by hand: `npm run generate:permissions` writes it and `npm run lint:permissions` fails when it is stale. `AuditEvent.eventType` is typed, so a core typo or an undeclared name does not compile. |
| The emitter | The manager door for the action, or the route only where no manager can tell the action apart (`page-read`, `page-export`, `secret-reveal`) | Building the record and calling `recordAuditEvent`. |

`npm run lint:audit` holds the three together: an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, or an emitter the script cannot resolve is red. `npm run docs:audit:check` holds the generated tables to the map. Both run in `lint`, `lint:ci` and the pre-commit hook.

## Adding an event

- 1 __Name it__ `{target}-{action}`, hyphens only. Where the action is the one a permission authorizes, use the permission's slug: `page-read` authorizes, `page-read` records. Never a dot, never an underscore, never a role name.
- 2 __Declare it__ in one place, in the same change as the emitter, never a later one: `ngdpbase.permissions.definitions.<name>.audit = { on-failure, enabled, description }` (#1638). `enabled: false` if it should ship switched off; `description` is one line, shown in the admin filter, and defaults to the permission's. If it records a permission's action (`page-edit`, `token-mint`), it goes on that permission's entry. If it records something nobody is granted, it is a new entry with `"grantable": false` (`src/utils/permissionCatalog.ts`): never offered as an app scope, never a row in the roles matrix, never in `CorePermission`, and no policy grants it. `ngdpbase.audit.events` ships empty; it is still read so an operator's custom file written before #1638 can override an event or remove it (`null`), and a name set there and on a permission entry is warned at boot. `npm run lint:audit` fails on a name declared in both in a shipped or add-on file.
- 3 __Regenerate__ with `npm run generate:permissions`: `AUDIT_EVENT.<NAME>` (the name upper-cased with underscores) now exists. An add-on instead declares the event in its own `config/default-config.json` and emits it through `host` — see [Addons](#addons) below.
- 4 __Emit it__ through `recordAuditEvent(sink, event, onError)`, where the sink is `engine.getManager('AuditManager')`. Never call `logAuditEvent` directly: that skips the `enabled` switch, the on-failure rule and the outcome.
- 5 __Decide `on-failure`.__ `refuse` means the action must not complete unless the record does: record first, then act, so a failed record refuses the action rather than leaving it done and unrecorded (`AgentTokenManager.mint`, `ShareManager.issue`, `UserManager.deleteUser` are the pattern). `continue` means the action proceeds and the loss is counted. This is failure handling, not importance; importance is `severity` on the record.
- 6 __Carry the actor.__ The record's "who" comes from the context the caller was given ([Every security-relevant call carries a context](security-developer-guide.md#every-security-relevant-call-carries-a-context)), built in one place: spread `actorOf(ctx)` (`{ eventType, ...who, …, metadata: { ...who.metadata, … } }`), never copy `user: ctx.username` across. A content builder (`buildPageMutationAuditEvent` and the rest) takes `viaProxy` beside `viaToken`. Under a proxy grant ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) that gives `user` = the user represented and a top-level `actor` = who actually did it, plus `metadata.delegated: 'proxy'` and `proxyGrantId`; with no proxy there is no `actor` field at all. A job's context gives the same as the request it was queued from: `metadata.delegated` (`token`, `share` or `proxy`, with `proxyGrantId`) on every row the job records, its own fields merged beside it, never in place of it ([#2059](https://github.com/jwilleke/ngdpbase/issues/2059)). A scheduled run's context also gives `metadata.job` (the job id it acts as) on every row it records, beside the run's own `jobId` and `slot` ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999)). `npm run lint:audit-attribution` fails on an audit row that sets `user` from anything else, or a builder call without `viaProxy`, unless the script lists it with a reason. There is no "nothing was given": a door that records takes the context as a mandatory parameter, so a job records its `JobContext` (origin and reason) and a boot path the system principal, never `unknown`. Never invent an identity from imported content or a default.
- 7 __Record names, never values.__ A password field changed is `fields: ['password']`; a secret revealed is the key, not the value; an audit export is who, format and filter, never the content.
- 8 __Regenerate the docs__: `npm run docs:audit`.
- 9 __Test it, then sabotage it.__ One test that the record is written with the actor and the metadata; for `refuse`, one that a failing sink refuses the action and leaves the state untouched. Then break the emitter on purpose and watch the test go red before trusting it; write what you broke in the test's comment.

## Who records what

Decided by the operator on 2026-10-17 ([#1825](https://github.com/jwilleke/ngdpbase/issues/1825)):

- __The enforcement point records what it allowed.__ The manager that guards a resource (the PEP) records each action it carried out, with the actor, the user acted for, and the resource's `owner` read from storage. It knows what was done ("lab results from Licking Memorial"); core doesn't. Examples: PageManager for pages, FileManager for files (`asset-upload` and `asset-delete`; AttachmentManager, the storage underneath it, records neither, [#2149](https://github.com/jwilleke/ngdpbase/issues/2149)), an add-on's own manager (PhrManager, LedgerManager) for its records, with events it declares. ReviewManager records a request for review filed, approved, rejected, or approved but not carried out (`review-filed`, `review-approved`, `review-rejected`, `review-failed`; [#2072](https://github.com/jwilleke/ngdpbase/issues/2072)): the request's id, kind, handler and permission, never its summary, details, note or the handler's failure text; the add-on's handler records its own work through its own doors.
- __An import is recorded by the receiver's door, not by the engine.__ Each item's own record is the door it went through (`page-create`, `asset-upload`). A takeout imported into a private store on `/import` is also recorded as one act, `store-import`, once per run, by `core.private-store`'s `runDone` (`recordStoreImport` in `src/managers/ImportManager.ts`, [#2118](https://github.com/jwilleke/ngdpbase/issues/2118)): the owner (identity `@id` and username), the store, the run id and counts only, never a page title or a file name, since the run is confidential ([#2110](https://github.com/jwilleke/ngdpbase/issues/2110)).
- __Core records every refusal.__ A refused attempt is never left to the enforcement point to remember:
  - page and media doors record each denial as `authorization-deny` (`PolicyInformationPoint.logAccessDecision`); an affordance records nothing;
  - `ApiContext.enforceDeny`, the one refusal helper, records the same `authorization-deny` event: actor, the user acted for, action, the resource and its owner when given, and the reason. __Not built yet__ (see [Known gaps](#known-gaps)).
- __The PDP records nothing.__ It decides; recording is the enforcement point's and the refusal helper's.
- Which events are recorded at all is configuration: each event's `enabled` in its catalog entry.

These records are what a user's read-only view of what happened to their own data is built from ([#1825](https://github.com/jwilleke/ngdpbase/issues/1825)).

## The entries about one user

A user sees the one audit log filtered to the entries about them, never a second log and never a copy (operator, 2026-10-22, [#1537](https://github.com/jwilleke/ngdpbase/issues/1537)). Nothing reading it removes anything; only retention removes rows. A row is about a user when the user is:

- its `user`: the account acted on, or the user represented under a proxy grant;
- its `actor`: who actually did it under a proxy grant;
- or the owner of the resource it names: `metadata.owner`. So an emitter whose action touches something a user owns puts that user's identity `@id` in `metadata.owner` and their username beside it in `metadata.ownerUser`, both read from storage, never from the request ([#2041](https://github.com/jwilleke/ngdpbase/issues/2041), step 6 of the [identity model](../planning/identity-model.md)): `IdentityManager.identityIdOf(ctx, username)`, with the system context for core's own lookup. It answers null for a name with no account, and when the identity store cannot answer, so the record is still written; `metadata.owner` is then the name as it is.

Rows written before #2041 name the owner by username, and no audit row is ever rewritten. The view matches all three: `searchEntriesAbout` looks up the user's identity `@id` and passes it to the provider as `ownerId`, and a row is about the user when its `metadata.owner` is their `@id` or their username, or its `metadata.ownerUser` is their username (`recordIsAbout`; the database provider's `owner` and `owner_user` columns, the second added by a migration). `ownerUser` is what still lists the rows about an account after it is deleted: its identity record goes with it, so there is no `@id` to look up, and an administrator lists them by the username. `user` and `actor` stay the username of the account that acted.

Core and add-ons ask through `AuditManager` with the request's subject, a page at a time:

```ts
const audit = engine.getManager('AuditManager');
const page = await audit.searchEntriesAbout(person, { limit: 50, offset: 0 }, ctx.subject);
// page: { results, total, limit, offset, hasMore }, newest first
```

The manager asks the PDP with that subject: `profile-manage` when the subject's username is `person` (every account holds it), `admin-system` for anyone else's entries. A refusal throws `AuditQueryForbiddenError`; never catch it into an empty page. An add-on (yourPHR's patient view) calls it from its own route or manager with the subject core handed it, and renders the rows itself. The database provider answers from indexes; the file provider from the newest 10,000 records it holds in memory.

## Addons

An add-on audits its own actions without any core change (#1638):

- Declare the event in the add-on's `config/default-config.json` exactly as core does: an `audit` field on a permission entry, the add-on's own permission when it records that permission's action, otherwise an entry with `"grantable": false`. It reaches the registry through the configuration merge while the add-on is enabled.
- Emit it with the two functions `host` hands the add-on ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)): `host.recordAuditEvent(sink, { eventType: host.addonAuditEventName('ledger-post'), ...host.actorOf(ctx), … })`, passing a string literal. The core union cannot name an add-on's events, so `addonAuditEventName` checks the `{target}-{action}` form. Both `host` functions accept only the events this add-on declares in its own `config/default-config.json` and throw on any other name, core's or another add-on's, so one add-on cannot write records that look like another's. `recordAuditEvent` itself also refuses (throws) a name the merged registry does not declare, such as one whose add-on is disabled.
- At boot, an enabled name that neither the shipped map nor an enabled add-on declares is a fatal configuration entry, as before.
- __`metadata.owner` is the owner's identity `@id`, and `metadata.ownerUser` their username__, from the release with [#2041](https://github.com/jwilleke/ngdpbase/issues/2041) on: `owner: (await persons.identityIdOf(ctx, username)) ?? username, ownerUser: username`. `identityIdOf` never throws for an identity store that is down; it answers null, and the row is written with the name. Until that release add-ons wrote the username in `owner`; rows already written stay as they are, and a user's entries list all of them, a deleted account's included.
- `npm run lint:audit` reads every bundled add-on's map and treats each `addonAuditEventName('…')` literal as an emitter, so a declared, enabled add-on event with no emitter is red. An external add-on's CI has to hold that itself.

## What `recordAuditEvent` returns

| Outcome | Meaning |
| --- | --- |
| `recorded` | The sink accepted it; for a `refuse` event, flushed to the device first |
| `not-enabled` | `enabled: false` in configuration — a decision on the record |
| `no-sink` | Auditing is off or not yet initialised; visible in the audit posture |
| `dropped` | A `continue` event the sink refused; counted and surfaced on the dashboard |

A `refuse` event that cannot be recorded does not return; it throws, and the caller must let that propagate.

## How you know you are done

```bash
npm run lint:audit
npm run lint:audit-attribution
npm run docs:audit:check
npm run audit:coverage
npm run audit:verify                 # the file provider's log
npm run audit:verify -- --database   # the database provider's log (#1537)
```

At boot the log says which provider loaded and whether the posture changed since the previous start; `/admin/audit` lists every declared event in its filter.

## See also

- [audit-posture.md](../audit-posture.md)
- [security-developer-guide.md](security-developer-guide.md)
- [AuditManager](../managers/AuditManager.md)
- `src/utils/auditEventNames.ts` (with `auditEventNames.generated.ts`), `src/utils/auditRegistry.ts`, `src/utils/permissionCatalog.ts`, `src/utils/addonHost.ts`

## Known gaps

- [#2118](https://github.com/jwilleke/ngdpbase/issues/2118) — `store-import` has two writers while the old takeout door is kept. `POST /my/takeout/import` records it in the route (`WikiRoutes.myTakeoutImport`, `src/routes/WikiRoutes.ts`) with `auditWho`, not in the door with `actorOf(ctx)`, and its record differs from the engine's: `bytes` is the archive's size there and the unpacked size on the engine, and only the engine's carries `owner`, `ownerUser`, `runId` and `leftOut`.
- [#1825](https://github.com/jwilleke/ngdpbase/issues/1825) — `enforceDeny` does not record its refusals yet; until it does, a refusal by an add-on's manager or a capability check leaves no audit record (page doors already record theirs). Audit entries don't carry a resource `owner` yet (#1823), and most reads (`page-read`, `asset-read`, `vault-proxy`) are switched off by default.
