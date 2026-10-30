---
name: Audit posture
description: Inventory of audit capabilities ngdpbase actually implements — chain, registry, durability, witness, and verification
dateModified: 2026-10-26
category: architecture
relatedModules: [AuditManager, FileAuditProvider, DatabaseAuditProvider, BaseAuditProvider, NullAuditProvider]
---

# Audit posture

What auditing on this instance can actually do, as implemented in code. How to add or change an event is the [audit developer guide](guides/audit-developer-guide.md).

This is an inventory, not a plan and not a recommendation — except [Audit planning](#audit-planning), which records decisions taken and not yet built. The living contract is the `audit` field of the entries in `ngdpbase.permissions.definitions` in `config/app-default-config.json` (every event, what happens when its record cannot be written, and whether it fires; #1638); `src/utils/auditRegistry.ts` reads it. The manager API is [AuditManager](managers/AuditManager.md). Decisions about security-related *settings* live in [security-posture.md](security-posture.md). The design that produced this work is [planning/Security-auditing.md](planning/Security-auditing.md).

## Guiding principle

__Auditing is a contract, not a courtesy.__ A security-relevant action is declared on its permission entry's `audit` field and emitted through `recordAuditEvent` (or the manager door that calls it). CI proves configuration and emitters agree. Configuration is authoritative: an operator may change an on-failure rule or switch an event off, and that change is itself audited. Remembering to log is not a design: it can be correct and can never be proven.

If you add or change an action that is gated by a permission, or that mints a credential, destroys something, or changes what someone may do:

- Declare the event on its permission entry's `audit` field (`"grantable": false` for a record nobody is granted) in the same change as the emitter, with its on-failure rule and a description. An emitted name with no declaration fails `npm run lint:audit`.
- Use a `{target}-{action}` name from that catalog. Do not invent a string at the call site, in a filter dropdown, or in a comment.
- Forward the request context you were given. Do not rebuild `{ username }` and drop `viaToken` — that is [P1](security-posture.md#p1--every-security-relevant-call-carries-a-context).
- Emit through `recordAuditEvent`, never `logAuditEvent` directly, and read its outcome if the caller cares. If the event is `on-failure: refuse`, the action must not complete when the record cannot be written. Do not catch-and-continue a `refuse` failure.
- Do not append to the log file, skip the chain, or restart it from application code. A silent repair is worse than a visible break.

A flag that turns the mechanism off creates two code paths, and the weak one is what everybody runs. The chain, the registry, and the vocabulary are always on. What an operator chooses is how hard failure is (`on-failure`) and how much is recorded (`enabled` per event in its catalog entry), not whether integrity exists.

## What the report answers

`AuditManager.getAuditPosture()` is the runtime report of what auditing is doing *right now*. It is facts about the active provider, not a label:

| Field | Meaning |
| --- | --- |
| `provider` | Name of the provider that is actually running |
| `configured` | Name that was requested (differs from `provider` when degraded) |
| `degraded` | Configured provider failed; events are being discarded |
| `reason` | Why it degraded, or `null` |
| `guarantees` | What the *active* provider claims: `tamperEvident`, `durability`, `queryable`, `headWitness`, and `encryptedAtRest` where the provider knows it (the database provider: whether the application database is SQLCipher-encrypted) |

A degraded instance must not report the guarantees of the provider it lost. `NullAuditProvider` reports `tamperEvident: false`, `queryable: false`, and `durability: null`.

The admin dashboard renders this when `degraded` is true. Boot also logs one line: `provider=…` or `DEGRADED: configured …`.

Turning auditing off (`ngdpbase.audit.enabled: false` or `provider: nullauditprovider`) is a decision on the record, not degradation.

## Completeness

Every event is declared in one catalog, `ngdpbase.permissions.definitions`, on the entry's `audit` field (#1638). An action and its record are one entry; a recorded thing nobody is granted (failed login, process start) is an entry with `"grantable": false`. `ngdpbase.audit.events` ships empty. A type not declared must not be emitted; a declared type that is not switched off must have an emitter. `auditVocabulary.test.ts`, `auditRegistry.test.ts` and `npm run lint:audit` fail CI on either divergence. The table an operator sees is [AuditManager — Event Types](managers/AuditManager.md#event-types); that table is pinned to the map by the same test.

An event switched off (`enabled: false`) is a decision on the record with its reason in the description: `asset-read`, `search-page`, `user-read`, `admin-read` today. The gated actions that had no emitter got them in [#1204](https://github.com/jwilleke/ngdpbase/issues/1204); the two permissions still without one, and why, are under [Permissions with no audit event](#permissions-with-no-audit-event).

### On failure

What happens when the record cannot be written — the disk full, the file unwritable, the fsync failing, the provider degraded to the null one, the process dying between append and sync. Declared per event in configuration as `on-failure`, not chosen at the call site (`refusesOnFailure()` reads the map bound by `AuditManager.initialize`):

| `on-failure` | Meaning | Implemented behaviour |
| --- | --- | --- |
| `refuse` | The action must not complete unless the record does | `recordAuditEvent` flushes, then rejects on failure, so the caller abandons the action. `FileAuditProvider` fsyncs these before the write resolves |
| `continue` | The action proceeds; the lost record is counted and surfaced | Buffered in memory; losses counted and shown on the dashboard |

This is failure handling, not importance. How important an event is lives on each record as `severity` (`low` … `critical`), set by the emitter. `authentication-failed` is high severity and `continue`, because the login is already refused; `system-start` is low severity and `refuse`, because the record must land before anything else does. Until [#1218](https://github.com/jwilleke/ngdpbase/issues/1218) the field was called `on-failure rule` with values `critical` / `standard` / `volume`, which read as an importance scale it never was; `volume` was `continue` with `enabled: false`.

Refuse on failure today: the generated list under [Results](#results).

`page-read` is the read-volume event. It ships `enabled: false` on its permission entry's `audit` field (#1203). The emitter is unconditional; `recordAuditEvent` honours the switch.

### What is recorded in production

Families with live emitters:

- Pages: create, edit, rename, delete, export, optional read, inbound-link rewrite after rename
- Attachments: upload, delete, metadata edit
- Accounts: create, edit (roles, password, active, external, email, profile lock), delete; user search switched off by default
- Administration: configuration reset (refuse on failure), backup written, masked value revealed (key only), audit trail exported
- Agent tokens: mint, revoke
- Private stores: a user's copy created at its door (`store-create`, with whether a key was made; never the words or a key)
- Authentication: success, failed, logout
- Authorization: deny (allows are not written; see below)
- Security: `security-event` with the kind in `metadata.securityEventType`
- Shares: create, access, revoke
- Process: `system-start` (and whether the previous run ended cleanly), `system-shutdown`
- Configuration: `config-change` for admin `setProperty()` writes
- Subsystems: `manager-state-change`
- Security settings at boot: `posture-recorded`, compared with the previous start
- Background jobs: started, completed, failed (with actor and origin)
- Administration: raw page edit, session revoke, clear-anonymous-sessions
- The trail itself: `audit-chain-restart`

`authorization-allow` and `policy-evaluate` have emitters on `AuditManager` (`logAccessDecision`, `logPolicyEvaluation`). Nothing in production calls them: `PolicyInformationPoint` records denials only, and only at a door — an affordance (`pageAffordance`, which decides whether to show a control) records nothing ([#1668](https://github.com/jwilleke/ngdpbase/issues/1668)) — and no caller reaches `logPolicyEvaluation`. They stay in the vocabulary because the methods exist and history may contain the names. An allowed action is recorded by the enforcement point as the action's own event; every refusal is core's to record ([audit developer guide — Who records what](guides/audit-developer-guide.md#who-records-what)). `ApiContext.enforceDeny` does not record its refusals yet ([#1825](https://github.com/jwilleke/ngdpbase/issues/1825)), so a refusal by an add-on's manager or a capability check leaves no audit record today.

Attribution on a record: `user`, `ipAddress`, `viaTokenId`, `viaTokenName`. A request that authenticated with an agent token is distinguishable from the same username acting in a browser session. Under a proxy grant a row also carries a top-level `actor` and `metadata.delegated: 'proxy'` ([Who a row names](#who-a-row-names)).

## Integrity

Hash chaining and monotonic sequence numbers are part of the provider contract, not of `FileAuditProvider`. `BaseAuditProvider.logAuditEvent()` stamps `seq` and `hash` (SHA-256 of the predecessor) before the subclass stores the record. A fifth provider gets tamper evidence without remembering to add it. `NullAuditProvider` overrides `chainEnabled()` to false because it stores nothing.

What the chain detects:

- Alteration of a record (hash breaks from that point on)
- Deletion of a record from the middle (sequence gap / hash break)
- A legitimate discontinuity, when an operator records one (below)

Truncation of the tail is a different check. Removing records from the end breaks no link, so the chain alone cannot see it. That is what the witness is for: `npm run audit:verify` compares the log's head against a published fingerprint, and a shortened tail fails. The capability is implemented ([#1138](https://github.com/jwilleke/ngdpbase/issues/1138)); it is unused until a destination is configured.

### Rotation and restart

`FileAuditProvider` continues the chain across file rotation ([#1122](https://github.com/jwilleke/ngdpbase/issues/1122)).

A broken chain is not repaired automatically. `npm run audit:restart-chain` writes an `audit-chain-restart` marker as an ordinary record (`seq` 1, genesis predecessor) naming who authorised it and why. The abandoned segment stays in the file and stays unverifiable. A restart without a reason is refused.

### Truncation detection (witness)

`ngdpbase.audit.chain-witness.destination` is a *file path*, not a directory. When set, the storing provider (file or database) appends one JSON line per publication (sequence + hash, not event content) on `ngdpbase.audit.chain-witness.interval-minutes` (default 60). It never overwrites the file. `getGuarantees().headWitness` reports destination, interval, last publication time, and last sequence.

Verification (`npm run audit:verify`) uses that fingerprint — or an assessor's `--head` / `--witness` — to detect a truncated tail. Exit 0 means the log matches a witness; exit 3 means the chain is intact but no witness was supplied, so truncation was not checked.

The shipped default destination is empty. That is a configuration choice, not a missing feature: verification then exits 3 rather than claiming the tail is complete.

The code never claims the path is off-box — nothing on the machine can verify that. A witness on the same volume as `audit.log` is deletable by anyone who can delete the log, which converts an honest "unknown" into a confident "intact" backed by nothing. The destination has to be on different hardware. See [security-posture.md](security-posture.md) D13, D20, D21.

## Durability

`FileAuditProvider.getDurability()` and `DatabaseAuditProvider.getDurability()` report the same shape (the database provider's `refuse` events are committed with SQLite `synchronous = FULL`):

- `fsync: false` — `continue` events are buffered (`ngdpbase.audit.flushinterval`, default 30s; `maxqueuesize`, default 1000)
- `fsyncedClasses` — the `refuse` events, written through and fsynced before the action completes ([#1158](https://github.com/jwilleke/ngdpbase/issues/1158))

A page or attachment delete whose audit record cannot be written is refused (HTTP 503), not executed. Token mint and revoke are the same shape. A sink without `flushAuditQueue` cannot promise that, so a `refuse` event refuses rather than reporting a guarantee the system does not have.

Losses of `continue` events increment a counter, log on an escalating schedule, and surface on the admin dashboard. They never fail the action.

On clean shutdown the file provider flushes with fsync, and the database provider writes its queue in one transaction. `system-shutdown` is itself `refuse`, so its absence before the next `system-start` is how the log states the previous run died and buffered records may be missing.

## Reviewability

`/admin/audit` is registered and served from `views/admin-audit.ejs` ([#1113](https://github.com/jwilleke/ngdpbase/issues/1113)). Operators can filter, paginate, inspect a record, and export JSON/CSV. The filter uses the `{target}-{action}` names. Records written under a retired name (snake_case before #1115, dotted before #1201) keep that name and match no current filter; the resolver that mapped them forward was removed in #1201.

### Who a row names

A row's `user` is the account acted on. Under a proxy grant ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) that is the user represented, and a separate top-level `actor` names the user who actually did it (`metadata.proxyGrantId` names the grant). A row with no proxy has no `actor` field, so every existing row reads as before. `/admin/audit` shows "acted by" beside the user and filters on it (`?actor=`, also on the API and the export). Every emitter builds the "who" from the caller's context in one place (`actorOf` / `proxyAttribution`); `npm run lint:audit-attribution` fails on one that writes a bare name, except those it lists with a reason (token mint and revoke, which slice 6 threads). A session chooses whom to act for at `/account/acting-for` (slice 4); each switch, and each drop back to the user's own account when the grant ends, is a `proxy-switch` row.

## Failure of auditing itself

`ngdpbase.audit.on-failure`:

| Value | What happens when the configured provider cannot be used |
| --- | --- |
| `continue` (shipped default) | Fall back to `NullAuditProvider`, mark the instance degraded, keep serving, banner on the admin dashboard |
| `refuse-boot` | `engine.maintenance.enter(…)` ([#1906](https://github.com/jwilleke/ngdpbase/issues/1906)) — the process stays alive in maintenance mode so `/admin` and `/login` remain reachable; the instance does not finish booting as a serving system |

Selecting `cloudauditprovider` takes this path: the class exists, extends `BaseAuditProvider`, and *rejects* `initialize()`. It is not a silent no-op: a configured stub becomes either a degraded instance or a blocked boot, depending on `on-failure`. So does `databaseauditprovider` on a site with no application database open (`ngdpbase.database.provider` `none`, or a database that could not be opened safely): the provider names the cause.

## Storage that actually stores

| Provider | Status | Notes |
| --- | --- | --- |
| `FileAuditProvider` | Production default | JSONL at `ngdpbase.audit.provider.file.logdirectory` / `auditfilename` (shipped `${FAST_STORAGE}/logs` / `audit.log`). Size rotation, archive, hourly retention against `ngdpbase.audit.retentiondays` (default 90). Chain resume from the file. Witness publication |
| `DatabaseAuditProvider` | Production ([#1537](https://github.com/jwilleke/ngdpbase/issues/1537)) | Rows in the application database (`ngdpbase.database.provider` `sqlite`), on `DatabaseManager`'s connection. Same chain and witness. Retention by checkpoint. Indexed queries. [Below](#the-database-provider) |
| `NullAuditProvider` | Production | Discards every event. Used when auditing is off, and as the degrade target |
| `CloudAuditProvider` | Stub | `initialize()` rejects. No CloudWatch / Azure / GCP client |

With the file provider, retention is defined and enforced by file rotation and archive expiry. It is not per-record demonstrable: a gap at a rotated-file boundary is either legitimate ageing or a deletion, and those look identical without an external head. With the database provider, retention leaves a checkpoint, and what remains verifies from it.

### The database provider

Built in [#1537](https://github.com/jwilleke/ngdpbase/issues/1537), on the operator's decisions of 2026-10-22 recorded there. Select it with `ngdpbase.audit.provider: databaseauditprovider` on a site whose `ngdpbase.database.provider` is `sqlite`.

- __One store.__ Every event goes to one table, `audit_events`, in the application database (core migration `20261022120000`). Nothing routes an event to another store, and nobody clears the log: only retention removes rows.
- __The chain.__ The same contract as the file provider: `BaseAuditProvider` stamps `seq`, `prevHash` and `hash`, and the row keeps the stamped record exactly as hashed (`record`), with copies of its fields in indexed columns (time, type, user, actor, owner, resource). Rows are kept in the order written (`row_id`), which is chain order; a chain restart's `seq` 1 is just another row. The chain head resumes from the newest row at start. The head witness is published exactly as the file provider publishes it, after the write.
- __Writes.__ A `continue` event is queued and the queue written in one transaction on `ngdpbase.audit.flushinterval`, or sooner at `ngdpbase.audit.maxqueuesize`. A `refuse` event writes the queue and itself in one transaction before the action goes on, so rows land in chain order; SQLite runs with `synchronous = FULL`, so the commit is on the device. A failed write puts the batch back at the front of the queue and, for a `refuse` event, refuses the action. The queue is written before every query, at shutdown, and before `DatabaseManager` copies the database into a backup.
- __Retention by checkpoint.__ Hourly (the `audit.database-retention` maintenance job) and at start, one transaction deletes the oldest rows up to the last one older than `ngdpbase.audit.retentiondays`, and writes a row in `audit_checkpoints` naming the seq and hash of the last row it removed. Verification starts from the newest checkpoint: the first remaining row must carry the next seq and link to that hash. The purge is recorded as `security-event` with `action: 'audit-archive-purge'`, resource `audit_events`, under the context of whoever ran it (the system principal, origin `boot` or `schedule`), with how many rows went and the checkpoint. A chain pruned to nothing resumes from the checkpoint.
- __Encryption at rest.__ The rows are encrypted when the database is (SQLCipher, `NGDPBASE_DATABASE_KEY`). An unencrypted database never stops the provider: `getGuarantees().encryptedAtRest` is `false`, and the start warns.
- __Queries.__ `searchAuditLogs`, `getAuditStats` and `exportAuditLogs` take the existing filters and run as SQL over the indexed columns, a page at a time, never more than `ngdpbase.audit.provider.database.max-results` rows (default 10000) in a page or an export.
- __The entries about one user.__ `AuditManager.searchEntriesAbout(person, { limit, offset }, caller)`: the rows where that user (the `person` argument, a username) is the `user`, the `actor`, or the owner of the resource (`metadata.owner`: the user's identity `@id` on rows from [#2041](https://github.com/jwilleke/ngdpbase/issues/2041) on, their username on older rows, which are never rewritten; new rows also carry the username in `metadata.ownerUser`, so a deleted account's rows still list; all match), newest first. A user reads their own with `profile-manage`; anyone else's needs `admin-system`; the PDP decides with the caller's subject. See [AuditManager](managers/AuditManager.md#searchentriesaboutperson-options-caller).
- __Backup and restore.__ The rows are in the application database, so they are in `DatabaseManager`'s copy of it and come back with it; AuditManager's own entry holds no files. On such a site, a backup that holds audit files (from a time the file provider was active) restores without them, and "the audit log" is named among the parts not restored ([AuditManager — Backup and restore](managers/AuditManager.md#backup-and-restore)).
- __Health.__ `isHealthy()` queries the audit tables; a provider that cannot start (no database open, or the database unavailable) degrades to the null provider or blocks the boot exactly as [Failure of auditing itself](#failure-of-auditing-itself) says.

## Operator knobs

The mechanism (chain, registry, vocabulary, parity tests, guarantees report) is always present. What varies is how hard the system fails and how much it records:

| Key | Shipped default | Effect |
| --- | --- | --- |
| `ngdpbase.audit.enabled` | `true` | Off loads `NullAuditProvider` deliberately |
| `ngdpbase.audit.provider` | `fileauditprovider` | Active backend |
| `ngdpbase.audit.on-failure` | `continue` | Degrade vs maintenance-mode refuse |
| `ngdpbase.permissions.definitions` (`audit` field) | the catalog | Every event's on-failure rule and `enabled` switch; `page-read` ships off |
| `ngdpbase.audit.events` | `{}` | Read only so a custom file written before #1638 can still override or remove (`null`) an event |
| `ngdpbase.audit.retentiondays` | `90` | File provider: archive expiry. Database provider: rows removed behind a checkpoint |
| `ngdpbase.audit.provider.database.max-results` | `10000` | Database provider: the largest page a search returns and the most rows an export holds |
| `ngdpbase.audit.chain-witness.destination` | `""` | Path to append chain-head fingerprints |
| `ngdpbase.audit.chain-witness.interval-minutes` | `60` | Maximum truncation window while a witness is configured |
| `ngdpbase.audit.flushinterval` | `30000` | Buffer flush for `continue` events (ms) |
| `ngdpbase.audit.maxqueuesize` | `1000` | In-memory queue before a forced flush |

`ngdpbase.audit.provider.file.logdirectory` is already separate from `ngdpbase.logging.dir`, so the audit log can sit on its own volume.

Recommended value sets for a deployment shape (`baseline` / `hardened` / `regulated`) are prose, not configuration — see the required-page recommendations and [security-posture.md](security-posture.md) D2. Nothing selects those knobs on the operator's behalf.

## How to verify

```bash
# Reads FAST_STORAGE/logs/audit.log by default.
# Exit 0 = verified against a witness; 1 = broken; 2 = could not read;
# 3 = chain intact but truncation undetectable.
npm run audit:verify

npx tsx scripts/verify-audit-chain.ts /path/to/audit.log --witness /path/to/audit-witness.jsonl
npx tsx scripts/verify-audit-chain.ts /path/to/audit.log --head <hash>

# The database provider's log: reads ngdpbase.database.file (or the path given)
# directly, read-only, under NGDPBASE_DATABASE_KEY, without booting the app,
# and verifies from the newest retention checkpoint.
npm run audit:verify -- --database
npx tsx scripts/verify-audit-chain.ts --database /path/to/ngdpbase.db --head <hash>
```

`--head` (an assessor's own hash, never stored on the audited machine) wins over `--witness`, which wins over the configured destination.

```bash
# Writes audit.chain-restart. Never called automatically.
npm run audit:restart-chain
```

Ask the running instance rather than inferring from config: `AuditManager.getAuditPosture()`.

## Declared gaps

These are decisions in the registry, not forgotten call sites. They are still gaps in what an assessor can be shown.

### Checking this yourself

```bash
npm run audit:coverage     # the report
npm run lint:audit         # the same check, exits 1 on any gap
npm run docs:audit:check   # the generated sections below match configuration
```

`scripts/audit-coverage.ts` compares the three lists that had no way of being compared by hand: the __vocabulary__ (names that may be used), the __registry__ (what must be recorded, and at what on-failure rule), and the __emitters__ (what the source actually sends). It walks `src/` and `addons/`, and resolves interpolated names — emitters build them as `` `page.${op}` ``, so a plain text search reports `page-create` as unemitted while it fires on every page save.

It fails the build on every direction (#1206): an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, and an emitter it cannot account for. Events switched off are reported, not failed: they are decisions on the record.

<!-- AUTO:audit-coverage BEGIN -->
#### Results

Generated by `npm run docs:audit` from `ngdpbase.audit.events` and `npm run audit:coverage`; `npm run docs:audit:check` fails the build when this section is stale.

| | |
| --- | --- |
| Declared in configuration | 113 |
| Required (declared and switched on) | 104 |
| Emitted by the source | 106 |
| Switched off | 8 |
| Refuse on failure | 33 |
| Gaps | 0 |

Every required event has an emitter, every emitted name is declared, and every name is `{target}-{action}`.

Switched off, on purpose, with the reason in each description: `admin-read` · `asset-read` · `executive-read` · `page-read` · `search-page` · `search-user` · `user-read` · `vault-proxy`.

Refuse on failure — the action does not complete unless the record does: `addon-install` · `addon-update` · `asset-delete` · `audit-chain-restart` · `backup-restore` · `backup-restore-cancel` · `backup-restore-replace` · `config-reset` · `consent-grant` · `consent-withdraw` · `invitation-cancel` · `invitation-send` · `page-delete` · `posture-recorded` · `proxy-grant` · `proxy-revoke` · `recovery-words-export` · `share-create` · `share-extend` · `share-revoke` · `shared-folder-create` · `shared-folder-key-create` · `shared-folder-words-create` · `shared-folder-words-discard` · `shared-folder-words-replace` · `store-create` · `system-shutdown` · `system-start` · `token-extend` · `token-mint` · `token-revoke` · `user-delete` · `vault-repair`.
<!-- AUTO:audit-coverage END -->

__Bundled addons emit nothing.__ The report covers `addons/`: forms declares `form-submit`, switched off, and nothing else declares or emits an event, while four of the five write user data — form submissions (`FormsDataManager.saveSubmission`), journal entries, calendar events, feed records. Not a registry gap, because nothing declares those actions at all; a coverage gap, and the same shape as [#1177](https://github.com/jwilleke/ngdpbase/issues/1177), where addon code was held to a weaker standard by default rather than by decision.

### Permissions with no audit event

Since [#1204](https://github.com/jwilleke/ngdpbase/issues/1204) every gated action that is an action has an emitter. Two permissions remain without one, for reasons that are not gaps:

| Permission | Why |
| --- | --- |
| `admin-roles` | Roles are configuration. The three admin role routes call methods deprecated to `never`; a role change is an edit to `ngdpbase.roles.definitions`, recorded as `config-change` through the admin UI or reported by `posture-recorded` after a disk edit. The dead routes are [#1210](https://github.com/jwilleke/ngdpbase/issues/1210)'s. |
| `admin-system` | A permission over some fifty admin routes, not one action. Decided per action in [#1215](https://github.com/jwilleke/ngdpbase/issues/1215): recorded as their own events (`config-change`, `config-reset`, `page-raw-edit`, `session-revoke`, `session-clear-anonymous`, `backup-create`, `secret-reveal`, `audit-export`); recorded through the door they write through (interwiki, addon toggle, maintenance and theme changes are `config-change`; keyword and required-page writes are `page-*`; import is `page-*`; reindex and media rebuilds are `job-*`; restart is `system-shutdown` / `system-start`); not recorded, by decision, because no data changes (cache clears, notifications dismissed). The policy create, update and delete routes call methods `PolicyManager` does not have and throw; policies are configuration, a change is `config-change`. |

Switched off, on purpose: `asset-read`, `search-page`, `user-read`, `admin-read`, `page-read`, `search-user`, `vault-proxy`. Each has `enabled: false` on its catalog entry with the reason in its description.

Also not implemented:

- The cloud backend (a stub that fails closed, as above)
- Per-record retention proof for the file provider (the database provider's checkpoint is the proof for its cut)
- Production emission of `authorization-allow` and `policy-evaluate`

## Audit planning

Decisions taken with the operator on 2026-09-04 under [#1184](https://github.com/jwilleke/ngdpbase/issues/1184). None is built yet; everything above this heading describes the code as it is. When a decision lands, its row here is replaced by the inventory entry that describes it.

### Configuration is authoritative — landed in [#1200](https://github.com/jwilleke/ngdpbase/issues/1200)

`ngdpbase.permissions.definitions` is the registry and the vocabulary (#1638): every event is declared on a permission entry's `audit` block. `auditRegistry.ts` (`auditDeclarationsFrom`) and `auditVocabulary.ts` are readers. The reasoning is in [Guiding principle](#guiding-principle) and [Completeness](#completeness) above. What remains of the decision is the naming rule, the tiers, and the emitters, below.

### One declaration per action

An action and its record are one thing (#1638). Each entry in `ngdpbase.permissions.definitions` declares a name once; its `audit` block says how using it is recorded, and `step-up: true` says it needs a fresh sign-in.

Some recorded things are not actions anyone may be granted: `system-start`, `authentication-failed`, `job-failed`. Their entries carry `"grantable": false` (`src/utils/permissionCatalog.ts`, the one predicate). A record is never offered to an app as a scope, never a row in the roles matrix or the permission listings, never in the generated `CorePermission` type, and no shipped policy grants one (a test holds that).

Today some actions are still checked under a different permission than the name they are recorded under — `admin-system` gates `session-clear-anonymous`; `config-manage` gates `config-change` and `backup-create`. Split so far: `page-raw-edit`, `session-revoke` and `audit-export` are their own permissions (granted to admin; reading the audit log stays `admin-system`), `share-manage` became `share-create`, `share-extend` and `share-revoke`, and a policy or token still naming `share-manage` is read as all three (`RETIRED_PERMISSIONS` in `src/utils/permissionCatalog.ts`). Those recorded names are entries with `grantable: false` until the checks are renamed, which changes who holds what and is decided separately.

The catalog is a map, not an array: a custom configuration overrides one entry without restating the rest, and an entry set to `null` removes a shipped one — the same reasoning as the `ngdpbase.security.posture` map. `ngdpbase.audit.events` ships empty; a custom file written before #1638 that overrides or removes (`null`) an event there is still honoured, and a name set in both places is reported at boot.

Fields per event:

| Field | Meaning |
| --- | --- |
| `on-failure` | `refuse` or `continue`, as [On failure](#on-failure) defines them (#1218; formerly `critical` / `standard` / `volume`) |
| `enabled` | Whether the emitter fires. Defaults to `true`. `false` is a decision on the record |
| `description` | One line, shown in the documented table and the admin filter |

The two exemption categories dissolve. `read-volume` becomes an event with `enabled: false` (`asset-read`, `search-page`, `user-read`, `admin-read`), the same shape `page-read` has today. `not-implemented` is gone: the gated, unrecorded actions got emitters in [#1204](https://github.com/jwilleke/ngdpbase/issues/1204) (`user-create`, `user-edit`, `user-delete`, `search-user`, `page-export`, `asset-edit`), and configuration decides whether each fires. `admin-roles` and `admin-system` are permissions over configuration and over many routes respectively; see [Permissions with no audit event](#permissions-with-no-audit-event).

Nothing about recording fails silently — landed in [#1205](https://github.com/jwilleke/ngdpbase/issues/1205):

- `recordAuditEvent` returns what became of the record: `recorded`, `not-enabled` (switched off in configuration), `no-sink` (auditing off or not yet initialised), or `dropped` (a `continue` event the sink refused; counted). A `refuse` event that cannot be recorded throws instead. Every emitter, including the `AuditManager` helpers and the admin routes, goes through that one door.
- An event that is `enabled` and has no emitter fails hard. `npm run lint:audit` fails the build; at boot `AuditManager` compares the enabled names against what this build declares — the shipped map plus every enabled add-on's (#1638); that each has an emitter is what the lint holds, and a name outside it — or outside the `{target}-{action}` convention — is a fatal configuration entry: the instance boots into maintenance mode with the name in the reason ([security-posture.md](security-posture.md) D9, D10).

### Naming: `{target}-{action}`, hyphens only — landed in [#1201](https://github.com/jwilleke/ngdpbase/issues/1201)

Every event is `{target}-{action}`, sharing the permission's slug where the action is the one the permission authorizes; the table is [AuditManager — Event Types](managers/AuditManager.md#event-types). The code's names are generated from the map into `src/utils/auditEventNames.generated.ts` (#1638), typed, so a core emitter cannot compile with a name configuration does not declare; an add-on emits through `addonAuditEventName`, checked at record time. Records on disk under dotted names are not mapped forward.

### Tiers for the fifteen undeclared events — landed in [#1202](https://github.com/jwilleke/ngdpbase/issues/1202)

`share-create`, `share-revoke` and `audit-chain-restart` are `refuse` (then called `critical`); the other twelve are `continue` (then `standard`). The tiers are in the [event table](managers/AuditManager.md#event-types). The three `refuse` emitters now keep the promise: `ShareManager` records through `recordAuditEvent` before the share exists or is revoked (the `token-mint` ordering), and `restartChain` writes the marker before it moves the chain head. A record that cannot be written refuses the action.

### `ngdpbase.audit.read-events` retires — landed in [#1203](https://github.com/jwilleke/ngdpbase/issues/1203)

The switch, its comment, and its posture pointer are gone. `page-read` ships `enabled: false`, `recordAuditEvent` honours the switch for every event, and `ngdpbase.permissions.definitions` and `ngdpbase.audit.events` are posture ingredients (group Audit, no restart), so a on-failure rule or switch change is reported by `posture-recorded` at the next boot. A custom configuration still setting the old key gets one boot warning naming the new location.

### What the coverage check proves — landed in [#1206](https://github.com/jwilleke/ngdpbase/issues/1206)

`scripts/audit-coverage.ts` reads the declarations (the permission entries' `audit` fields, and `ngdpbase.audit.events`) from the shipped defaults and every bundled add-on, and resolves emitters through the generated names and `addonAuditEventName` literals. `npm run lint:audit` fails on every direction: an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, and an emitter it cannot resolve. It reports, without failing, the events switched off. [Results](#results) and the [event table](managers/AuditManager.md#event-types) are generated from configuration by `npm run docs:audit`; `npm run docs:audit:check` fails the build when either is stale ([#1207](https://github.com/jwilleke/ngdpbase/issues/1207), landed).

## See also

- [AuditManager](managers/AuditManager.md) — API, event-type table, search and export
- [FileAuditProvider](providers/FileAuditProvider.md), [NullAuditProvider](providers/NullAuditProvider.md), [BaseAuditProvider](providers/BaseAuditProvider.md)
- [security-posture.md](security-posture.md) — the instance's security settings, including the audit knobs as ingredients
- [planning/Security-auditing.md](planning/Security-auditing.md) — the nine falsifiable statements this inventory implements
- `scripts/audit-coverage.ts` — the vocabulary/registry/emitter report behind the counts above
