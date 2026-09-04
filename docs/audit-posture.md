---
name: Audit posture
description: Inventory of audit capabilities ngdpbase actually implements — chain, registry, durability, witness, and verification
dateModified: 2026-09-04
category: architecture
relatedModules: [AuditManager, FileAuditProvider, BaseAuditProvider, NullAuditProvider]
---

# Audit posture

What auditing on this instance can actually do, as implemented in code.

This is an inventory, not a plan and not a recommendation — except [Audit planning](#audit-planning), which records decisions taken and not yet built. The living contract is `ngdpbase.audit.events` in `config/app-default-config.json` (every event, its tier, and whether it fires); `src/utils/auditRegistry.ts` reads it. The manager API is [AuditManager](managers/AuditManager.md). Decisions about security-related *settings* live in [security-posture.md](security-posture.md). The design that produced this work is [planning/Security-auditing.md](planning/Security-auditing.md).

## Guiding principle

__Auditing is a contract, not a courtesy.__ A security-relevant action is declared in `ngdpbase.audit.events` and emitted through `recordAuditEvent` (or the manager door that calls it). CI proves configuration and emitters agree. Configuration is authoritative: an operator may change a tier or switch an event off, and that change is itself audited. Remembering to log is not a design: it can be correct and can never be proven.

If you add or change an action that is gated by a permission, or that mints a credential, destroys something, or changes what someone may do:

- Declare the event in `ngdpbase.audit.events` in the same change as the emitter, with its tier and a description. An emitted name with no declaration fails `npm run lint:audit`.
- Use a `{target}.{action}` name from that map. Do not invent a string at the call site, in a filter dropdown, or in a comment.
- Forward the request context you were given. Do not rebuild `{ username }` and drop `viaToken` — that is [P1](security-posture.md#p1--every-security-relevant-call-carries-a-context).
- Emit through `recordAuditEvent` and read its outcome if the caller cares. If the type is `critical`, the action must not complete when the record cannot be written. Do not catch-and-continue a critical failure.
- Do not append to the log file, skip the chain, or restart it from application code. A silent repair is worse than a visible break.

A flag that turns the mechanism off creates two code paths, and the weak one is what everybody runs. The chain, the registry, and the vocabulary are always on. What an operator chooses is how hard failure is (`on-failure`) and how much is recorded (`enabled` per event in `ngdpbase.audit.events`), not whether integrity exists.

## What the report answers

`AuditManager.getAuditPosture()` is the runtime report of what auditing is doing *right now*. It is facts about the active provider, not a label:

| Field | Meaning |
| --- | --- |
| `provider` | Name of the provider that is actually running |
| `configured` | Name that was requested (differs from `provider` when degraded) |
| `degraded` | Configured provider failed; events are being discarded |
| `reason` | Why it degraded, or `null` |
| `guarantees` | What the *active* provider claims: `tamperEvident`, `durability`, `queryable`, `headWitness` |

A degraded instance must not report the guarantees of the provider it lost. `NullAuditProvider` reports `tamperEvident: false`, `queryable: false`, and `durability: null`.

The admin dashboard renders this when `degraded` is true. Boot also logs one line: `provider=…` or `DEGRADED: configured …`.

Turning auditing off (`ngdpbase.audit.enabled: false` or `provider: nullauditprovider`) is a decision on the record, not degradation.

## Completeness

`ngdpbase.audit.events` is one map keyed by event. Events are actions taken; permissions are authority; neither registry carries the other's fields, so a permission that gates several recorded actions and a recorded action with no permission (failed login, process start) sit in the same map. A type not declared there must not be emitted; a declared type that is not switched off must have an emitter. `auditVocabulary.test.ts`, `auditRegistry.test.ts` and `npm run lint:audit` fail CI on either divergence. The table an operator sees is [AuditManager — Event Types](managers/AuditManager.md#event-types); that table is pinned to the map by the same test.

An event switched off (`enabled: false`) is a decision on the record with its reason in the description: `asset-read`, `search-page`, `user-read`, `admin-read` today. The gated actions that had no emitter got them in [#1204](https://github.com/jwilleke/ngdpbase/issues/1204); the two permissions still without one, and why, are under [Permissions with no audit event](#permissions-with-no-audit-event).

### Tiers

Declared per event in configuration, not chosen at the call site (`isCriticalEventType()` reads the map bound by `AuditManager.initialize`):

| Tier | Meaning | Implemented behaviour |
| --- | --- | --- |
| `critical` | The action must not complete unless the record does | `recordAuditEvent` flushes, then rejects on failure. `FileAuditProvider` fsyncs these classes before the write resolves |
| `standard` | Fire-and-forget | Buffered in memory; losses counted and surfaced |
| `volume` | High-frequency reads | Emitter exists; fires only when the named config key is true |

Critical types today: `page-delete`, `asset-delete`, `token-mint`, `token-revoke`, `share-create`, `share-revoke`, `system-start`, `system-shutdown`, `posture-recorded`, `user-delete`, `audit-chain-restart`.

`page-read` is the volume event. It ships `enabled: false` in `ngdpbase.audit.events` (#1203). The emitter is unconditional; `recordAuditEvent` honours the switch.

### What is recorded in production

Families with live emitters:

- Pages: create, edit, rename, delete, export, optional read, inbound-link rewrite after rename
- Attachments: upload, delete, metadata edit
- Accounts: create, edit (roles, password, active, external, email, profile lock), delete; people search switched off by default
- Agent tokens: mint, revoke
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

`authorization-allow` and `policy-evaluate` have emitters on `AuditManager` (`logAccessDecision`, `logPolicyEvaluation`). Nothing in production calls them: `ACLManager` records denials only, and no caller reaches `logPolicyEvaluation`. They stay in the vocabulary because the methods exist and history may contain the names.

Attribution on a record: `user`, `ipAddress`, `viaTokenId`, `viaTokenName`. A request that authenticated with an agent token is distinguishable from the same username acting in a browser session.

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

`ngdpbase.audit.chain-witness.destination` is a *file path*, not a directory. When set, `FileAuditProvider` appends one JSON line per publication (sequence + hash, not event content) on `ngdpbase.audit.chain-witness.interval-minutes` (default 60). It never overwrites the file. `getGuarantees().headWitness` reports destination, interval, last publication time, and last sequence.

Verification (`npm run audit:verify`) uses that fingerprint — or an assessor's `--head` / `--witness` — to detect a truncated tail. Exit 0 means the log matches a witness; exit 3 means the chain is intact but no witness was supplied, so truncation was not checked.

The shipped default destination is empty. That is a configuration choice, not a missing feature: verification then exits 3 rather than claiming the tail is complete.

The code never claims the path is off-box — nothing on the machine can verify that. A witness on the same volume as `audit.log` is deletable by anyone who can delete the log, which converts an honest "unknown" into a confident "intact" backed by nothing. The destination has to be on different hardware. See [security-posture.md](security-posture.md) D13, D20, D21.

## Durability

`FileAuditProvider.getDurability()` reports:

- `fsync: false` — standard and volume events are buffered (`ngdpbase.audit.flushinterval`, default 30s; `maxqueuesize`, default 1000)
- `fsyncedClasses` — the critical types, written through and fsynced before the action completes ([#1158](https://github.com/jwilleke/ngdpbase/issues/1158))

A page or attachment delete whose audit record cannot be written is refused (HTTP 503), not executed. Token mint and revoke are the same shape. A sink without `flushAuditQueue` cannot promise that, so a critical event refuses rather than reporting a guarantee the system does not have.

Non-critical losses increment a counter, log on an escalating schedule, and surface on the admin dashboard. They never fail the action.

On clean shutdown the file provider flushes with fsync. `system-shutdown` is itself critical, so its absence before the next `system-start` is how the log states the previous run died and buffered records may be missing.

## Reviewability

`/admin/audit` is registered and served from `views/admin-audit.ejs` ([#1113](https://github.com/jwilleke/ngdpbase/issues/1113)). Operators can filter, paginate, inspect a record, and export JSON/CSV. The filter uses canonical `{target}.{action}` names and widens to retired snake_case names on read (`canonicalEventTypeOf` / `legacyTypesFor`), so history written before the rename stays findable.

## Failure of auditing itself

`ngdpbase.audit.on-failure`:

| Value | What happens when the configured provider cannot be used |
| --- | --- |
| `continue` (shipped default) | Fall back to `NullAuditProvider`, mark the instance degraded, keep serving, banner on the admin dashboard |
| `refuse-boot` | `engine.blockConfiguration(…)` — the process stays alive in maintenance mode so `/admin` and `/login` remain reachable; the instance does not finish booting as a serving system |

Selecting `databaseauditprovider` or `cloudauditprovider` takes this path. Both classes exist, extend `BaseAuditProvider`, and *reject* `initialize()` (`DatabaseAuditProvider not yet implemented. Use FileAuditProvider instead.` and the cloud equivalent). They are not silent no-ops: a configured stub becomes either a degraded instance or a blocked boot, depending on `on-failure`.

## Storage that actually stores

| Provider | Status | Notes |
| --- | --- | --- |
| `FileAuditProvider` | Production default | JSONL at `ngdpbase.audit.provider.file.logdirectory` / `auditfilename` (shipped `${FAST_STORAGE}/logs` / `audit.log`). Size rotation, archive, hourly retention against `ngdpbase.audit.retentiondays` (default 90). Chain resume from the file. Witness publication |
| `NullAuditProvider` | Production | Discards every event. Used when auditing is off, and as the degrade target |
| `DatabaseAuditProvider` | Stub | `initialize()` rejects. Advertised config keys exist; there is no database client |
| `CloudAuditProvider` | Stub | Same: `initialize()` rejects. No CloudWatch / Azure / GCP client |

Retention is defined and enforced by file rotation and archive expiry. It is not per-record demonstrable: a gap at a rotated-file boundary is either legitimate ageing or a deletion, and those look identical without an external head.

## Operator knobs

The mechanism (chain, registry, vocabulary, parity tests, guarantees report) is always present. What varies is how hard the system fails and how much it records:

| Key | Shipped default | Effect |
| --- | --- | --- |
| `ngdpbase.audit.enabled` | `true` | Off loads `NullAuditProvider` deliberately |
| `ngdpbase.audit.provider` | `fileauditprovider` | Active backend |
| `ngdpbase.audit.on-failure` | `continue` | Degrade vs maintenance-mode refuse |
| `ngdpbase.audit.events` | the map | Every event's tier and `enabled` switch; `page-read` ships off |
| `ngdpbase.audit.retentiondays` | `90` | File-provider archive expiry |
| `ngdpbase.audit.chain-witness.destination` | `""` | Path to append chain-head fingerprints |
| `ngdpbase.audit.chain-witness.interval-minutes` | `60` | Maximum truncation window while a witness is configured |
| `ngdpbase.audit.flushinterval` | `30000` | Buffer flush for non-critical events (ms) |
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

`scripts/audit-coverage.ts` compares the three lists that had no way of being compared by hand: the __vocabulary__ (names that may be used), the __registry__ (what must be recorded, and at what tier), and the __emitters__ (what the source actually sends). It walks `src/` and `addons/`, and resolves interpolated names — emitters build them as `` `page.${op}` ``, so a plain text search reports `page-create` as unemitted while it fires on every page save.

It fails the build on every direction (#1206): an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, and an emitter it cannot account for. Events switched off are reported, not failed: they are decisions on the record.

<!-- AUTO:audit-coverage BEGIN -->
#### Results

Generated by `npm run docs:audit` from `ngdpbase.audit.events` and `npm run audit:coverage`; `npm run docs:audit:check` fails the build when this section is stale.

| | |
| --- | --- |
| Declared in configuration | 42 |
| Required (declared and switched on) | 36 |
| Emitted by the source | 38 |
| Switched off | 6 |
| Critical tier | 11 |
| Gaps | 0 |

Every required event has an emitter, every emitted name is declared, and every name is `{target}-{action}`.

Switched off, on purpose, with the reason in each description: `admin-read` · `asset-read` · `page-read` · `search-page` · `search-user` · `user-read`.

Critical — the action does not complete unless the record does: `asset-delete` · `audit-chain-restart` · `page-delete` · `posture-recorded` · `share-create` · `share-revoke` · `system-shutdown` · `system-start` · `token-mint` · `token-revoke` · `user-delete`.
<!-- AUTO:audit-coverage END -->

__Addons emit nothing.__ The report covers `addons/` and finds zero audit events there, while four of the five write user data — form submissions (`FormsDataManager.saveSubmission`), journal entries, calendar events, feed records. Not a registry gap, because nothing declares those actions at all; a coverage gap, and the same shape as [#1177](https://github.com/jwilleke/ngdpbase/issues/1177), where addon code was held to a weaker standard by default rather than by decision.

### Permissions with no audit event

Since [#1204](https://github.com/jwilleke/ngdpbase/issues/1204) every gated action that is an action has an emitter. Two permissions remain without one, for reasons that are not gaps:

| Permission | Why |
| --- | --- |
| `admin-roles` | Roles are configuration. The three admin role routes call methods deprecated to `never`; a role change is an edit to `ngdpbase.roles.definitions`, recorded as `config-change` through the admin UI or reported by `posture-recorded` after a disk edit. The dead routes are [#1210](https://github.com/jwilleke/ngdpbase/issues/1210)'s. |
| `admin-system` | A permission over some forty admin routes, not one action. The recorded ones are `config-change`, `page-raw-edit`, `session-revoke`, `session-clear-anonymous`; the unrecorded ones (policy create/delete, backup, restore, configuration reset, addon toggle, import, reindex, cache clears, keyword consolidation) are surveyed and decided in [#1215](https://github.com/jwilleke/ngdpbase/issues/1215). |

Switched off, on purpose: `asset-read`, `search-page`, `user-read`, `admin-read`, `page-read`, `search-user`. Each has `enabled: false` in `ngdpbase.audit.events` with the reason in its description.

Also not implemented:

- Database and cloud backends (stubs that fail closed, as above)
- Per-record retention proof
- Production emission of `authorization-allow` and `policy-evaluate`

## Audit planning

Decisions taken with the operator on 2026-09-04 under [#1184](https://github.com/jwilleke/ngdpbase/issues/1184). None is built yet; everything above this heading describes the code as it is. When a decision lands, its row here is replaced by the inventory entry that describes it.

### Configuration is authoritative — landed in [#1200](https://github.com/jwilleke/ngdpbase/issues/1200)

`ngdpbase.audit.events` is the registry and the vocabulary; `auditRegistry.ts` and `auditVocabulary.ts` are readers. The reasoning is in [Guiding principle](#guiding-principle) and [Completeness](#completeness) above. What remains of the decision is the naming rule, the tiers, and the emitters, below.

### Events are actions; permissions are authority

`ngdpbase.permissions.definitions` says who may act. `ngdpbase.audit.events` says what is recorded when someone does. Neither carries the other's fields. One permission may gate several recorded actions (`admin-system` gates `config-change`, `page-raw-edit`, `session-revoke`, `session-clear-anonymous`), and many recorded actions have no permission at all (`authentication-failed`, `system-start`). A map keyed by event holds both kinds without a second entity.

The map is a map, not an array: a custom configuration overrides one entry without restating the rest, and an entry set to `null` removes a shipped one — the same reasoning as the `ngdpbase.security.posture` map.

Fields per event:

| Field | Meaning |
| --- | --- |
| `tier` | `critical`, `standard` or `volume`, as the tiers table above defines them |
| `enabled` | Whether the emitter fires. Defaults to `true`. `false` is a decision on the record |
| `description` | One line, shown in the documented table and the admin filter |

The two exemption categories dissolve. `read-volume` becomes an event with `enabled: false` (`asset-read`, `search-page`, `user-read`, `admin-read`), the same shape `page-read` has today. `not-implemented` is gone: the gated, unrecorded actions got emitters in [#1204](https://github.com/jwilleke/ngdpbase/issues/1204) (`user-create`, `user-edit`, `user-delete`, `search-user`, `page-export`, `asset-edit`), and configuration decides whether each fires. `admin-roles` and `admin-system` are permissions over configuration and over many routes respectively; see [Permissions with no audit event](#permissions-with-no-audit-event).

Nothing about recording fails silently — landed in [#1205](https://github.com/jwilleke/ngdpbase/issues/1205):

- `recordAuditEvent` returns what became of the record: `recorded`, `not-enabled` (switched off in configuration), `no-sink` (auditing off or not yet initialised), or `dropped` (a standard event the sink refused; counted). A critical event that cannot be recorded throws instead. Every emitter, including the `AuditManager` helpers and the admin routes, goes through that one door.
- An event that is `enabled` and has no emitter fails hard. `npm run lint:audit` fails the build; at boot `AuditManager` compares the enabled names against what this build lists in `src/utils/auditEventNames.ts` (every name there has an emitter, which the lint holds), and a name outside it — or outside the `{target}-{action}` convention — is a fatal configuration entry: the instance boots into maintenance mode with the name in the reason ([security-posture.md](security-posture.md) D9, D10).

### Naming: `{target}-{action}`, hyphens only — landed in [#1201](https://github.com/jwilleke/ngdpbase/issues/1201)

Every event is `{target}-{action}`, sharing the permission's slug where the action is the one the permission authorizes; the table is [AuditManager — Event Types](managers/AuditManager.md#event-types). The code lists the names once in `src/utils/auditEventNames.ts`, typed, so an emitter cannot compile with a name configuration does not declare. Records on disk under dotted names are not mapped forward.

### Tiers for the fifteen undeclared events — landed in [#1202](https://github.com/jwilleke/ngdpbase/issues/1202)

`share-create`, `share-revoke` and `audit-chain-restart` are `critical`; the other twelve are `standard`. The tiers are in the [event table](managers/AuditManager.md#event-types). The three critical emitters now keep the promise: `ShareManager` records through `recordAuditEvent` before the share exists or is revoked (the `token-mint` ordering), and `restartChain` writes the marker before it moves the chain head. A record that cannot be written refuses the action.

### `ngdpbase.audit.read-events` retires — landed in [#1203](https://github.com/jwilleke/ngdpbase/issues/1203)

The switch, its comment, and its posture pointer are gone. `page-read` ships `enabled: false`, `recordAuditEvent` honours the switch for every event, and `ngdpbase.audit.events` is a posture ingredient (group Audit, no restart), so a tier or switch change is reported by `posture-recorded` at the next boot. A custom configuration still setting the old key gets one boot warning naming the new location.

### What the coverage check proves — landed in [#1206](https://github.com/jwilleke/ngdpbase/issues/1206)

`scripts/audit-coverage.ts` reads `ngdpbase.audit.events` and resolves emitters through `src/utils/auditEventNames.ts`. `npm run lint:audit` fails on every direction: an emitted name with no declaration, a declared and enabled name nobody emits, a name outside `{target}-{action}`, and an emitter it cannot resolve. It reports, without failing, the events switched off. [Results](#results) and the [event table](managers/AuditManager.md#event-types) are generated from configuration by `npm run docs:audit`; `npm run docs:audit:check` fails the build when either is stale ([#1207](https://github.com/jwilleke/ngdpbase/issues/1207), landed).

## See also

- [AuditManager](managers/AuditManager.md) — API, event-type table, search and export
- [FileAuditProvider](providers/FileAuditProvider.md), [NullAuditProvider](providers/NullAuditProvider.md), [BaseAuditProvider](providers/BaseAuditProvider.md)
- [security-posture.md](security-posture.md) — the instance's security settings, including the audit knobs as ingredients
- [planning/Security-auditing.md](planning/Security-auditing.md) — the nine falsifiable statements this inventory implements
- `scripts/audit-coverage.ts` — the vocabulary/registry/emitter report behind the counts above
