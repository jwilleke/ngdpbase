---
name: Audit posture
description: Inventory of audit capabilities ngdpbase actually implements — chain, registry, durability, witness, and verification
dateModified: 2026-09-04
category: architecture
relatedModules: [AuditManager, FileAuditProvider, BaseAuditProvider, NullAuditProvider]
---

# Audit posture

What auditing on this instance can actually do, as implemented in code.

This is an inventory, not a plan and not a recommendation — except [Audit planning](#audit-planning), which records decisions taken and not yet built. The living contracts are `src/utils/auditRegistry.ts` (what must be recorded) and `src/utils/auditVocabulary.ts` (the event names). The manager API is [AuditManager](managers/AuditManager.md). Decisions about security-related *settings* live in [security-posture.md](security-posture.md). The design that produced this work is [planning/Security-auditing.md](planning/Security-auditing.md).

## Guiding principle

__Auditing is a contract, not a courtesy.__ A security-relevant action is declared in `auditRegistry.ts`, named in `auditVocabulary.ts`, and emitted through `recordAuditEvent` (or the manager door that calls it). CI proves the three agree. Remembering to log is not a design: it can be correct and can never be proven.

If you add or change an action that is gated by a permission, or that mints a credential, destroys something, or changes what someone may do:

- Declare the event type (or an exemption with a reason) in the registry in the same change as the emitter. An omitted row is a bug; `not-implemented` is the honest form of "not yet."
- Use a `{target}.{action}` name from the vocabulary. Do not invent a string at the call site, in a filter dropdown, or in a comment.
- Forward the request context you were given. Do not rebuild `{ username }` and drop `viaToken` — that is [P1](security-posture.md#p1--every-security-relevant-call-carries-a-context).
- If the type is `critical`, the action must not complete when the record cannot be written. Do not catch-and-continue a critical failure.
- Do not append to the log file, skip the chain, or restart it from application code. A silent repair is worse than a visible break.

A flag that turns the mechanism off creates two code paths, and the weak one is what everybody runs. The chain, the registry, and the vocabulary are always on. What an operator chooses is how hard failure is (`on-failure`) and how much is recorded (`read-events`), not whether integrity exists.

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

Every permission in the permission registry has a declared audit requirement in `src/utils/auditRegistry.ts`. Absence is a named exemption (`read-volume` or `not-implemented`), not a missing row. Events that are not gated by a permission (failed login, token mint, process start) live in `UNGATED_REQUIREMENTS` in the same file.

`src/utils/auditVocabulary.ts` is the event-name contract. A type not listed there must not be emitted; a type listed as `emitted: true` must have an emitter. `auditVocabulary.test.ts` and `auditRegistry.test.ts` fail CI on either divergence. The table an operator sees is [AuditManager — Event Types](managers/AuditManager.md#event-types); that table is pinned to the vocabulary by the same test.

### Tiers

Declared per event, not chosen at the call site (`isCriticalEventType()`):

| Tier | Meaning | Implemented behaviour |
| --- | --- | --- |
| `critical` | The action must not complete unless the record does | `recordAuditEvent` flushes, then rejects on failure. `FileAuditProvider` fsyncs these classes before the write resolves |
| `standard` | Fire-and-forget | Buffered in memory; losses counted and surfaced |
| `volume` | High-frequency reads | Emitter exists; fires only when the named config key is true |

Critical types today: `page.delete`, `attachment.delete`, `token.mint`, `token.revoke`, `system.start`, `system.shutdown`, `posture.recorded`.

`page.view` is the volume event. It is gated by `ngdpbase.audit.read-events` (default `false`). The emitter is unconditional; the key only decides whether it fires.

### What is recorded in production

Families with live emitters:

- Pages: create, edit, rename, delete, optional view, inbound-link rewrite after rename
- Attachments: upload, delete
- Agent tokens: mint, revoke
- Authentication: success, failed, logout
- Authorization: deny (allows are not written; see below)
- Security: `security.event` with the kind in `metadata.securityEventType`
- Shares: create, access, revoke
- Process: `system.start` (and whether the previous run ended cleanly), `system.shutdown`
- Configuration: `config.change` for admin `setProperty()` writes
- Subsystems: `manager.state-change`
- Security settings at boot: `posture.recorded`, compared with the previous start
- Background jobs: started, completed, failed (with actor and origin)
- Administration: raw page edit, session revoke, clear-anonymous-sessions
- The trail itself: `audit.chain-restart`

`authorization.allow` and `policy.evaluate` have emitters on `AuditManager` (`logAccessDecision`, `logPolicyEvaluation`). Nothing in production calls them: `ACLManager` records denials only, and no caller reaches `logPolicyEvaluation`. They stay in the vocabulary because the methods exist and history may contain the names.

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

A broken chain is not repaired automatically. `npm run audit:restart-chain` writes an `audit.chain-restart` marker as an ordinary record (`seq` 1, genesis predecessor) naming who authorised it and why. The abandoned segment stays in the file and stays unverifiable. A restart without a reason is refused.

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

On clean shutdown the file provider flushes with fsync. `system.shutdown` is itself critical, so its absence before the next `system.start` is how the log states the previous run died and buffered records may be missing.

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
| `ngdpbase.audit.read-events` | `false` | Whether `page.view` is written |
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
npm run lint:audit         # the same check, exits 1 on an unambiguous gap
```

`scripts/audit-coverage.ts` compares the three lists that had no way of being compared by hand: the __vocabulary__ (names that may be used), the __registry__ (what must be recorded, and at what tier), and the __emitters__ (what the source actually sends). It walks `src/` and `addons/`, and resolves interpolated names — emitters build them as `` `page.${op}` ``, so a plain text search reports `page.create` as unemitted while it fires on every page save.

It fails the build only on the unambiguous directions: a required event nobody emits, a name outside the vocabulary, or an emitter it cannot account for. It does __not__ fail on an emitted event that carries no registry requirement, because closing those needs a tier decision per event ([#1184](https://github.com/jwilleke/ngdpbase/issues/1184)) and a check that fails before the decision exists is one people switch off.

#### Results on 2026-09-03

| | |
| --- | --- |
| Vocabulary declares | 32 |
| Registry requires | 17 |
| Source emits | 32 |

Every name is emitted, nothing is emitted under an unpermitted name, and nothing declared required lacks an emitter. What the report shows is the middle row: __fifteen event types are emitted with no stated requirement__, so they have no tier, and `isCriticalEventType()` answers `false` for each — not as a decision, but because they are not present to be graded:

`authentication.success` · `authentication.failed` · `authentication.logout` · `authorization.allow` · `authorization.deny` · `security.event` · `share.create` · `share.access` · `share.revoke` · `admin.page.raw-edit` · `admin.sessions.revoke` · `admin.sessions.clear-anonymous` · `audit.chain-restart` · `page.link-rewrite` · `policy.evaluate`

`UNGATED_REQUIREMENTS` exists for exactly this — events with no permission behind them — and its own comment names the case: *"A failed login has no permission behind it, because nobody is authenticated yet, and it is exactly what an assessor asks for."* `authentication.failed` is not in the list that comment introduces.

__Addons emit nothing.__ The report covers `addons/` and finds zero audit events there, while four of the five write user data — form submissions (`FormsDataManager.saveSubmission`), journal entries, calendar events, feed records. Not a registry gap, because nothing declares those actions at all; a coverage gap, and the same shape as [#1177](https://github.com/jwilleke/ngdpbase/issues/1177), where addon code was held to a weaker standard by default rather than by decision.

### Permissions with no audit event

Eight permissions exist and are gated, but have no audit event. The registry marks them `exempt: 'not-implemented'` so the gap is a decision, not a missing row (`src/utils/auditRegistry.ts`):

| Permission | Why it is listed |
| --- | --- |
| `page-export` | Bulk extraction of content |
| `asset-edit` | EXIF/IPTC edits change provenance metadata |
| `search-user` | Enumerating people is more disclosive than searching pages |
| `user-create` | Account lifecycle |
| `user-edit` | Includes role changes, which change what someone may do |
| `user-delete` | Destruction of an account and its attribution |
| `admin-system` | The permission itself is uncovered; `admin.page.raw-edit` and `admin.sessions.*` do exist |
| `admin-roles` | Changing a role changes everyone holding it |

Read-volume exemptions (not recorded, on purpose): `asset-read`, `search-page`, `user-read`, `admin-read`.

Also not implemented:

- Database and cloud backends (stubs that fail closed, as above)
- Per-record retention proof
- Production emission of `authorization.allow` and `policy.evaluate`

## Audit planning

Decisions taken with the operator on 2026-09-04 under [#1184](https://github.com/jwilleke/ngdpbase/issues/1184). None is built yet; everything above this heading describes the code as it is. When a decision lands, its row here is replaced by the inventory entry that describes it.

### Configuration is authoritative

`ngdpbase.audit.events` in `config/app-default-config.json` is the audit registry and the audit vocabulary. `src/utils/auditRegistry.ts` and `src/utils/auditVocabulary.ts` stop declaring and become readers over the active configuration. `isCriticalEventType()`, the admin filter dropdown, the documented event table and `requiredEventTypes()` all answer from configuration.

This reverses the "lives in code, not configuration" note in `auditRegistry.ts` from [#1120](https://github.com/jwilleke/ngdpbase/issues/1120). The reason given there — that an operator who could edit it could narrow what the system claims to audit — is the point, not the objection: configuration being authoritative is a key property of ngdpbase. Narrowing is not quiet. An admin UI edit records `config-change`, and a disk edit is reported by `posture-recorded` at the next boot, because `ngdpbase.audit.events` is a posture ingredient (below).

The only audit facts left in code are the emitters. The coverage check proves configuration and emitters agree.

### Events are actions; permissions are authority

`ngdpbase.permissions.definitions` says who may act. `ngdpbase.audit.events` says what is recorded when someone does. Neither carries the other's fields. One permission may gate several recorded actions (`admin-system` gates `config-change`, `page-raw-edit`, `session-revoke`, `session-clear-anonymous`), and many recorded actions have no permission at all (`authentication-failed`, `system-start`). A map keyed by event holds both kinds without a second entity.

The map is a map, not an array: a custom configuration overrides one entry without restating the rest, and an entry set to `null` removes a shipped one — the same reasoning as the `ngdpbase.security.posture` map.

Fields per event:

| Field | Meaning |
| --- | --- |
| `tier` | `critical`, `standard` or `volume`, as the tiers table above defines them |
| `enabled` | Whether the emitter fires. Defaults to `true`. `false` is a decision on the record |
| `description` | One line, shown in the documented table and the admin filter |

The two exemption categories dissolve. `read-volume` becomes an event with `enabled: false` (`asset-read`, `search-page`, `user-read`, `admin-read`), the same shape `page-read` has today. `not-implemented` goes away: the eight actions that are gated and unrecorded (`page-export`, `asset-edit`, `search-user`, `user-create`, `user-edit`, `user-delete`, `admin-roles`, and `admin-system` itself) get emitters, and configuration decides whether each fires.

Nothing about recording fails silently:

- An emitter for a disabled event returns `not-enabled` rather than returning nothing. A caller can tell "recorded" from "switched off" from "no sink".
- An event that is `enabled` and has no emitter fails hard. `npm run lint:audit` fails the build, and at boot the emitters register their names with `AuditManager`, so a configuration that enables a name nothing registered is a fatal configuration entry and the instance boots into maintenance mode ([security-posture.md](security-posture.md) D9, D10).

### Naming: `{target}-{action}`, hyphens only

One convention for permissions and events: target first, hyphen separated, URL-safe. Where an event is the action a permission authorizes, the two share the slug — `page-read` authorizes, `page-read` records — and the containing map says which is meant. Events with no permission keep the same shape.

| Today | New |
| --- | --- |
| `page.create` / `page.edit` / `page.rename` / `page.delete` | `page-create` / `page-edit` / `page-rename` / `page-delete` |
| `page.view` | `page-read` |
| `page.link-rewrite` | `page-link-rewrite` |
| `attachment.upload` / `attachment.delete` | `asset-upload` / `asset-delete` |
| `token.mint` / `token.revoke` | `token-mint` / `token-revoke` |
| `authentication.success` / `.failed` / `.logout` | `authentication-success` / `authentication-failed` / `authentication-logout` |
| `authorization.allow` / `authorization.deny` | `authorization-allow` / `authorization-deny` |
| `policy.evaluate` | `policy-evaluate` |
| `security.event` | `security-event` |
| `share.create` / `share.access` / `share.revoke` | `share-create` / `share-access` / `share-revoke` |
| `system.start` / `system.shutdown` | `system-start` / `system-shutdown` |
| `config.change` | `config-change` |
| `manager.state-change` | `manager-state-change` |
| `posture.recorded` | `posture-recorded` |
| `job.started` / `job.completed` / `job.failed` | `job-started` / `job-completed` / `job-failed` |
| `admin.page.raw-edit` | `page-raw-edit` |
| `admin.sessions.revoke` | `session-revoke` |
| `admin.sessions.clear-anonymous` | `session-clear-anonymous` |
| `audit.chain-restart` | `audit-chain-restart` |

Three rows change more than punctuation. `admin.*` loses its prefix because the target is the page or the session, and that an admin did it is the record's `user` field. `attachment.*` becomes `asset-*` to match the permission.

Records already on disk under dotted or underscored names are not mapped forward. The legacy resolver in `auditVocabulary.ts` goes with the file. The operator's decision: the trail is days old and may die.

### Tiers for the fifteen undeclared events

| Event (new name) | Tier | Reason |
| --- | --- | --- |
| `share-create` | critical | Mints an anonymous-access credential; the same shape as `token-mint` |
| `share-revoke` | critical | Pairs with `token-revoke`, already critical |
| `audit-chain-restart` | critical | The marker is the action; it cannot half-complete |
| `authentication-failed` | standard | `critical` means "refuse the action when the record fails", and a failed login is already refused |
| `authentication-success` | standard | `critical` would refuse every login when the audit volume is full; the same reasoning as `config-change` |
| `authentication-logout` | standard | |
| `authorization-deny` | standard | Recorded at ten sites; must not block a render |
| `authorization-allow`, `policy-evaluate` | standard | Emitters exist and nothing calls them; declared so history has a tier |
| `security-event` | standard | Fired from filters inside the render pipeline |
| `share-access` | standard | Batched counts; closer to volume |
| `page-raw-edit`, `page-link-rewrite` | standard | Page writes; `page-edit` is standard |
| `session-revoke`, `session-clear-anonymous` | standard | Reversible; the user signs in again |

A `critical` row is a promise the emitter has to keep. Today all fifteen call `AuditManager.logAuditEvent` directly inside a catch-and-continue block, so the action completes whether or not the record was written. The three critical rows rework their emitters to go through `recordAuditEvent`, which flushes and rejects on failure, so the caller abandons the action. The twelve standard rows describe what the code does now.

### `ngdpbase.audit.read-events` retires

The switch, its comment, and its posture pointer all go. The value becomes `enabled` on the `page-read` event. The posture map gains one row, `ngdpbase.audit.events` under group Audit with `restart: false`, in place of the `read-events` row, so any tier or switch change is reported by `posture-recorded`.

### What the coverage check proves after this

`scripts/audit-coverage.ts` reads `ngdpbase.audit.events` instead of parsing two source files, and `npm run lint:audit` fails on:

- an emitter whose name is not in configuration — the [#1184](https://github.com/jwilleke/ngdpbase/issues/1184) direction, now closable because every event has a decision
- an event that is `enabled` and has no emitter — a stated requirement the code does not meet
- a name that is not `{target}-{action}`

It reports, without failing, events declared with `enabled: false`: the decisions not to record, listed by the same mechanism that lists everything else. [Results](#results-on-2026-09-03) and [Permissions with no audit event](#permissions-with-no-audit-event) are regenerated from that report rather than restated by hand.

## See also

- [AuditManager](managers/AuditManager.md) — API, event-type table, search and export
- [FileAuditProvider](providers/FileAuditProvider.md), [NullAuditProvider](providers/NullAuditProvider.md), [BaseAuditProvider](providers/BaseAuditProvider.md)
- [security-posture.md](security-posture.md) — the instance's security settings, including the audit knobs as ingredients
- [planning/Security-auditing.md](planning/Security-auditing.md) — the nine falsifiable statements this inventory implements
- `scripts/audit-coverage.ts` — the vocabulary/registry/emitter report behind the counts above
