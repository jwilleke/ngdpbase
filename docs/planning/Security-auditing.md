# Security auditing — the bar, where we stand, and what would meet it

> __Status: analysis and proposal, 2026-08-29.__ Not adopted. Records the findings from a session that started with one naming inconsistency and ended in a structural question. The operator's framing sets the bar: __security and audit must be extremely defined and provable, and the system should be able to meet any security assessment.__

## The plan — the end state

Nine statements. Each is __falsifiable__, because a security property you cannot test is a property you cannot be assessed on — which is the whole thesis of this document.

| # | When this is done | Provable by |
|---|---|---|
| 1 | Every permission in the registry has a declared audit event type | A table an assessor reads, generated from the registry |
| 2 | Something demonstrably emits each declared type | A test that fails when a permission gains no audit path |
| 3 | Every record carries a monotonic sequence number | A gap in the sequence is detectable |
| 4 | Every record carries the hash of its predecessor | Altering a record breaks the chain from there on |
| 5 | The chain verifies across file rotations and to an off-box anchor | A verifier run in front of the assessor |
| 6 | Integrity holds whichever provider is configured | It is stamped in `BaseAuditProvider`, not in one implementation |
| 7 | Any instance can be asked what it guarantees | `getProviderInfo()` reports `tamperEvident` / `durable` / `queryable` / `offBox` |
| 8 | Critical events are durable before the action completes | Kill the process mid-action; the record is there or the action did not happen |
| 9 | Non-critical losses are counted and surfaced, never silent | The dashboard shows them; a healthy instance shows nothing |

Two properties are deliberately __not__ on this list. __Reviewability__ (an operator can read and search the log) was the gap [#1113](https://github.com/jwilleke/ngdpbase/issues/1113) closed, and is now met. __Attribution__ (who acted, including delegation) was already met before any of this work.

## Where we are now

| # | End state | Now |
|---|---|---|
| 1 | Required set declared | ✗ Nothing declares it. Denials __are__ audited at 10 call sites; nobody could state that without grepping |
| 2 | Emission proven | ✗ No parity test. Documented and emitted vocabularies disagree in both directions |
| 3 | Sequence number | ✗ Wall-clock timestamps only |
| 4 | Hash chain | ✗ `FileAuditProvider.ts:406` is a bare `fs.appendFile` of JSONL |
| 5 | Verifiable across rotation | ✗ Nothing to verify |
| 6 | Provider-independent | ✗ `logAuditEvent` is abstract (`BaseAuditProvider.ts:214`); each provider owns its whole write |
| 7 | Guarantees reportable | ✗ `getProviderInfo()` reports identity, not guarantees |
| 8 | Critical durability | ✗ All events are fire-and-forget, by the decision in [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) |
| 9 | Losses visible | ✓ Counted since boot, escalating error log, surfaced on the admin dashboard |
| — | Reviewability | ✓ [#1113](https://github.com/jwilleke/ngdpbase/issues/1113) |
| — | Attribution | ✓ `user`, `ipAddress`, `viaTokenId`, `viaTokenName` |
| — | Retention | ~ 90 days configured and enforced by rotation, but not demonstrable — see below |

Two of twelve met outright, one of them today, and one partial. The pluggable provider shape is already in place — `BaseAuditProvider` exists and `File` / `Database` / `Cloud` / `Null` all extend it — so none of this requires new architecture, only a stronger contract.

## The gaps

Ordered by what each unblocks rather than by severity, since three of the four are prerequisites for the ones after.

| Gap | Issue | Closes | Cost | Blocked by |
|---|---|---|---|---|
| __0. A failed audit provider silently becomes `Null`__ | [#1118](https://github.com/jwilleke/ngdpbase/issues/1118) | all of them | Low | nothing |
| __A. No declared required set__ | [#1120](https://github.com/jwilleke/ngdpbase/issues/1120) | 1, 2 | Low — the permission registry is already enumerable data | nothing |
| __B. No integrity in the contract__ | [#1119](https://github.com/jwilleke/ngdpbase/issues/1119) | 3, 4, 5, 6, 7 | Low __now__: `Database` and `Cloud` are scaffolds, so there is nothing to migrate | nothing |
| __C. Audit is emitted by callers, not doors__ | [#1121](https://github.com/jwilleke/ngdpbase/issues/1121) | strengthens 1, 2 | High — touches every manager | A, to know what is missing |
| __D. One durability tier for everything__ | [#1121](https://github.com/jwilleke/ngdpbase/issues/1121) | 8 | Medium | A, to declare which events are critical |

__Gap 0 was not in the original analysis and outranks everything else.__ `AuditManager.ts:281-285` catches any provider load failure and falls back to `NullAuditProvider`, which discards every event, while the server boots healthy. An operator who points audit at the advertised `databaseauditprovider` — a scaffold — gets an instance that believes it has an audit trail and has none. So does an instance whose log directory becomes unwritable. Every other statement in the plan is conditional on this, because a guarantee that evaporates on a configuration error is not a guarantee.

The configuration makes it reachable rather than theoretical: `config/app-default-config.json` advertises `database.type`, `connectionstring`, `tablename`, `maxconnections`, `cloud.service`, `region` and `loggroup` for two providers that are `TODO` lists.

__Gap 0 first, then gap B.__ Gap 0 is small and unblocks the credibility of everything else. Gap B is next, despite A being listed first in the layered proposal below. It is self-contained in the provider layer, it is the thing an assessor will actually test, it gets cheaper-to-later only, and unlike C and D it depends on none of the architectural questions still open in [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) and [#1116](https://github.com/jwilleke/ngdpbase/issues/1116).

The rest of this document is the evidence behind that table, and the proposal behind the fixes.

## Why "provable" is the operative word

An audit log that is correct but unprovable fails an assessment. Every framework worth naming — HIPAA §164.312(b), SOC 2 CC7, ISO 27001 A.12.4, NIST 800-53 AU — asks the same six questions, and each is a __demonstration__ rather than an assertion. The nine statements above exist to answer them:

| The question an assessor asks | Answered by |
|---|---|
| __Completeness__ — prove every security-relevant action is recorded | 1, 2 |
| __Integrity__ — prove records were not altered or deleted | 3, 4, 5, 6 |
| __Ordering and time__ — prove sequence, detect gaps | 3, 5 |
| __Failure__ — what happens when audit itself fails | 8, 9 |
| __Attribution__ — who did it, including delegated actors | already met |
| __Retention__ — defined, enforced, demonstrable | see below |

Statement 7 — that an instance can be asked what it guarantees — answers none of the six directly and enables all of them. Without it, every answer above is *"depends how it is configured"*.

__Retention deserves its own note, because it is the one question that looks met and is not.__ Ninety days is configured and enforced by file rotation, which satisfies "defined" and "enforced". It does not satisfy __demonstrable__: nothing proves that a record which *should* still exist has not been aged out early, or that rotation deleted only what policy allowed. The sequence numbers in statement 3 are what would close that — a gap at the boundary of a rotated file is either legitimate retention or a deletion, and today those look identical. Retention is therefore folded into the integrity work rather than tracked separately.

## What the evidence actually showed

The gaps above are not theoretical. Each was found by reading the code during one session.

### The audit log has no integrity mechanism

`FileAuditProvider.ts:406` is a bare `fs.appendFile` of JSON lines. No hash, no sequence number, no chain. Anything with filesystem access can alter or delete a line and leave no trace. This matters more than it looks: the architecture note's own tamper-evidence argument is that *"an attacker who owns the machine can rewrite a local audit log and erase what they did"*, which is precisely the state of things.

### Completeness is unknowable rather than absent

Authorization denials __are__ audited — `logAccessDecision` has 10 call sites. Nobody could state that without grepping, because nothing declares what must be audited. That is the difference between being correct and being provable, and it is the whole problem in one example.

### The documented vocabulary and the emitted vocabulary disagree, both ways

Documented in `docs/managers/AuditManager.md` but never emitted under that name: `authorization.deny`, `authentication.failed`, `security.breach_attempt`, `page.view`.

Emitted but undocumented: `access_decision`, `policy_evaluation`, `security_event`, `authentication`, `share_access`, `admin.page.raw-edit`, `admin.sessions.revoke`, `admin.sessions.clear-anonymous`, and the `page.*` / `attachment.*` / `token.*` families.

Three of the four "missing" types are the __same events under different names__:

| Documented | Actually emitted as |
|---|---|
| `authorization.deny` | `access_decision` with `result: 'deny'` |
| `authentication.failed` | `authentication` with `result: 'failure'` |
| `security.breach_attempt` | `security_event`, caller's type demoted into `context.securityEventType` |
| `page.view` | genuinely absent |

Two naming conventions coexist — dotted `page.edit` / `token.mint` alongside bare `access_decision` / `security_event`. The admin page filters `eventType` as an exact string, so an operator filtering for a documented name gets nothing back and cannot distinguish that from *"nothing happened"*. Tracked in [#1115](https://github.com/jwilleke/ngdpbase/issues/1115).

`logPolicyEvaluation` has __zero__ call sites — dead code emitting an undocumented type.

### The log had no reader at all

`views/admin-audit.ejs` and four handlers existed with no route registration, so `/admin/audit` returned 404. Fixed in [#1113](https://github.com/jwilleke/ngdpbase/issues/1113). Worth recording because a log nobody can read fails the __reviewability__ half of every framework listed above, and the gap survived for as long as it did precisely because nothing was checking.

### Security events were recorded with no severity and no description

`SecurityFilter` and `SpamFilter` each declared their own local `AuditManager` interface with a one-argument `logSecurityEvent`, against a real four-argument method. Every security violation and every spam detection emitted `severity: undefined`, `reason: undefined` and `securityEventType: undefined` — while the callers had already computed the values they were discarding. Fixed in [`a55fd892`](https://github.com/jwilleke/ngdpbase/commit/a55fd892).

## The pattern underneath all of it

Five findings in one week share one shape, and it is worth naming because the sixth is already out there somewhere:

| | A declaration said | Reality was | Nothing checked because |
|---|---|---|---|
| [#1104](https://github.com/jwilleke/ngdpbase/issues/1104) | 8 page variables documented | never registered | docs are not tested |
| [#1106](https://github.com/jwilleke/ngdpbase/issues/1106) | frontmatter is preserved | only if the caller reposts it | every caller happened to |
| [#1113](https://github.com/jwilleke/ngdpbase/issues/1113) | `IACLManager` has these methods | `ACLManager` does not | a local interface + a test mock |
| [#1115](https://github.com/jwilleke/ngdpbase/issues/1115) | `logSecurityEvent(violation)` | `(context, type, severity, description)` | a local interface |
| [#1115](https://github.com/jwilleke/ngdpbase/issues/1115) | these event types exist | different names emitted | docs are not tested |

__A local type declaration is a claim about code you do not own, and `tsc` validates against the claim rather than the code.__ That is why every one of these compiled and passed tests. For ordinary features it produces a bug; for audit it produces a system that reports compliance it does not have, which is worse than reporting nothing.

## The core insight

Today, being audited depends on a producer __remembering to call a method__. That can be correct. It can never be provable, because you cannot demonstrate the absence of a forgotten call site.

Provability requires inverting it: __declare the requirement as data, then check it mechanically.__

## Proposal, in four layers

### 1. Derive the required set from the permission registry

`{target}-{action}` permissions already __are__ the definition of a security-relevant action — that is what a permission is. The registry is enumerable today: `ngdpbase.permissions.definitions` in configuration, plus 18 registered in `UserManager`.

```text
for every permission in the registry
  -> a declared audit event type must exist
  -> and a test must prove something emits it
```

This converts *"we think we audit everything"* into a table an assessor can read and a CI job that goes red when a permission is added without an audit path. It also dissolves the vocabulary problem: __the registry is the vocabulary__, and the parity test compares the emitted set against it.

### 2. Audit at the door, not at the caller

The manager checks the permission; the manager emits the audit. If an action passed a permission check, it is audited by construction. This is the one-door invariant from [`architecture-principles-typescript.md`](architecture-principles-typescript.md) applied to audit, and it removes the forgotten-call-site failure mode rather than testing for it.

Already partly established: [#1111](https://github.com/jwilleke/ngdpbase/issues/1111) emits token events from `AgentTokenManager` rather than the route, deliberately, on the grounds that *"an unaudited mint is a credential nobody knows exists"*. `page.*` events are still emitted from `WikiRoutes`, so only the HTTP path is audited.

### 3. Integrity belongs in the provider CONTRACT, not in one provider

`BaseAuditProvider` already exists, and `File`, `Database`, `Cloud` and `Null` all extend it — the pluggable shape is in place. The gap is what the base guarantees.

`logAuditEvent` is __abstract__ (`BaseAuditProvider.ts:214`), so each provider implements the entire write. Integrity stamped inside `FileAuditProvider` would protect nothing in `DatabaseAuditProvider`, and __whether an instance is tamper-evident would depend on which provider is configured__. That is exactly the kind of conditional guarantee an assessment finds, and it cannot be answered with "it depends on your storage backend".

So integrity must be a property of the __contract__:

```text
BaseAuditProvider.logAuditEvent(event)      // concrete, final
  -> stamp seq, prevHash, timestamp          // integrity, always
  -> this.writeEvent(stamped)                // abstract: storage only
```

A template method. The subclass implements __storage__ and cannot skip integrity, because it never sees the un-stamped record. Adding a fifth provider gets tamper evidence for free rather than having to remember it.

Two notes on the existing providers, since they affect what "works everywhere" means today:

- `DatabaseAuditProvider` (197 lines) and `CloudAuditProvider` (204 lines) are __scaffolds__ — their headers are lists of `TODO: Implement …`. So the contract change is cheap now and expensive later, which argues for doing it before either is built out.
- `NullAuditProvider` must stay exempt by design: it stores nothing, so it has nothing to chain. That is a legitimate configuration state, not a hole — but an instance running `Null` should not be able to claim tamper evidence, which means the __capability must be reportable__, not assumed.

That last point generalises, and it is the piece that makes the whole thing answerable: `getProviderInfo()` should carry what the provider actually guarantees — `tamperEvident`, `durable`, `queryable`, `offBox` — so an operator or an assessor can __ask the system what it provides__ rather than inferring it from configuration.

That is worth stating as the general rule this document is really about: __a security property that has to be inferred is not a property you can be assessed on.__ It is the same shape as completeness — the difference between the system being correct and the system being able to demonstrate it.

### 3a. The mechanism: hash chain and sequence number

Each record carries a monotonic `seq` and the `prevHash` of its predecessor.

- Altering record *N* breaks the chain from *N* onward — __detectable__
- Deleting a record leaves a sequence gap — __detectable__
- Periodically anchoring the head hash off-box makes truncation detectable — __detectable__

This is what converts *"trust us"* into a verification that can be run in front of an assessor. One `sha256` per event.

### 4. Tiered durability

The fire-and-forget decision recorded in [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) is right for `page.view` and wrong for `token.mint`. Not every event needs the same guarantee, so classify them in the same registry as layer 1:

| Tier | Examples | Guarantee |
|---|---|---|
| __Critical__ | authentication, authorization denial, credential lifecycle, permission change | Durable __before__ the action completes; refuse the action if the audit write fails |
| __Standard__ | content mutations | Fire-and-forget, counted, surfaced (current behaviour) |
| __Volume__ | reads | Sampled, or off by default |

Putting the tier in the registry makes *"which events must be durable"* data rather than a judgement made per call site.

## Staging, cheapest first

1. __Registry and parity test.__ No behaviour change. Immediately answers "prove completeness", and resolves [#1115](https://github.com/jwilleke/ngdpbase/issues/1115) as a side effect.
2. __Integrity in the base contract.__ Make `logAuditEvent` concrete on `BaseAuditProvider` — stamp `seq` and `prevHash`, delegate storage to an abstract `writeEvent` — and have `getProviderInfo()` report what the provider guarantees. Contained to the provider layer; no manager or caller changes. The largest assessment win per line of code, and __cheapest now__: `DatabaseAuditProvider` and `CloudAuditProvider` are still scaffolds, so the contract can change before there is anything to migrate.
3. __Audit at the door.__ A real refactor touching every manager. Do it after the registry says what is missing.
4. __Tiered durability.__ Needs step 1 to define the tiers, and answers the remaining open question in [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) for the critical tier.

## Where this proposal is weak

Recorded deliberately — a proposal about provability that overclaims is self-defeating.

__Audit-at-the-door does not cover un-permissioned events.__ A failed login has no permission check to hang off, because nobody is authenticated yet. Layer 2 covers authorization; authentication needs its own hook, and that should be designed before committing to the approach.

__A hash chain conflicts with file rotation.__ The current provider rotates; a chain must either span rotations or each file becomes an independent chain with an unverifiable join. Solvable, and it is the detail that decides whether the integrity claim is real.

__A concrete `logAuditEvent` narrows what a provider may do.__ Making the base stamp integrity means a provider can no longer own its whole write — a store with native append-only semantics or its own sequencing might reasonably want to. The template method should leave `writeEvent` free to add its own guarantees, and `getProviderInfo()` is how it says so, but this does trade some provider freedom for a guarantee that holds everywhere. That is the right trade for audit and would be the wrong one for, say, search.

__The permission registry is a floor, not a ceiling.__ It defines what is __gated__, not what is __sensitive__. Reading a private page may warrant an entry without a distinct permission existing. Layer 1 therefore yields a provable floor for completeness, and that limit should be stated to an assessor rather than papered over.

__Renaming event types breaks continuity.__ The admin page filters `eventType` as an exact string, so existing entries stop matching until the 90-day retention ages them out. Acceptable, but it is a real discontinuity rather than a free rename.

## For the framework direction

This all applies more sharply to YourPHR, where [yourphr#507](https://github.com/jwilleke/yourphr/issues/507) already makes audit a __required capability that refuses to boot__, on the principle that an unaudited disclosure did not happen. A system holding that line cannot also silently drop audit records for actions that did happen — so the tiering in layer 4 is not optional there, and the integrity work in layer 3 is what makes the off-box tamper-evidence argument in [`architecture-principles-typescript.md`](architecture-principles-typescript.md) more than an aspiration.

## Related

- [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) — who owns a write spanning two managers; audit loss is its live instance
- [#1113](https://github.com/jwilleke/ngdpbase/issues/1113) — the audit page was unreachable (fixed)
- [#1115](https://github.com/jwilleke/ngdpbase/issues/1115) — event vocabulary; emitter half fixed, naming half open
- [#1116](https://github.com/jwilleke/ngdpbase/issues/1116) — where authorization narrows a list
- [#1117](https://github.com/jwilleke/ngdpbase/issues/1117) — content filters as providers
