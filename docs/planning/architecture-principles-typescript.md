# Architecture principles for the TypeScript stack

> __Status: adopted direction, 2026-08-16.__ Operator decision: follow the concepts in [`jwilleke/ngdpbase`](https://github.com/jwilleke/ngdpbase) `src/` as far as they fit. This records *which* concepts, how they map onto a PHR, and — the part that matters — which ones do not transfer.

## The target state

Everything below this section is the road: what was decided, when, and why. This section is the destination — stated without hedging, so a gap against it reads as a gap rather than as an open question in a vacuum. __Nothing here describes the code as it stands today.__

### One picture

Three layers, and a fourth thing that is not a layer.

```text
   PagesManager        RecordsManager        AuditManager        ← the doors
        │                    │                    │                policy, audit, effects
   PagesProvider       RecordsProvider      AuditProvider        ← resource-shaped
        │                    │                    │                getPage / getRecord / append
        └────────────┬───────┴──────────┬─────────┘
                     ▼                  ▼
              datastore 'pages'   datastore 'phi'                ← storage-shaped
                                                                   bytes and rows only
```

A __manager__ is the one door to a resource. A __resource provider__ implements that resource over a particular storage shape. A __datastore__ is a named binding to somewhere bytes live — a SQLite file and its key, a filesystem root, a bucket. The fourth thing is __configuration__, which chooses the bindings and parameterises them, and never expresses logic.

The layer boundaries are one-directional and total: managers reach only providers, providers reach only datastores, and nothing outside a manager reaches any of them.

### Datastores are named, plural, and carry their own attributes

There is no single ambient connection and no `handle` anyone can reach for. There is a registry of named datastores, each independently bound:

```text
app     sqlite      file=app.db        encrypted=false
phi     sqlite      file=phi.db        encrypted=true    key=…
pages   filesystem  root=/data/pages   encrypted=false
audit   s3          bucket=…           encrypted=true    offbox=true
```

Three properties follow, and each is a problem that stops being solved per-resource:

- __Encryption is an attribute of a binding, not of a resource.__ "Encrypted pages" and "encrypted records" are the same mechanism, configured, never two implementations.
- __Egress is an attribute of a binding.__ A key whose value moves records off the machine is marked as such, loud in the admin UI, defaulted local, and never altered by an upgrade that finds the default untouched.
- __The key holder exports.__ Backup of a datastore's contents is performed by the component holding its key, because only that component can produce an encrypted, consistent, restorable artifact. The resource manager decides __what__ is in scope; the datastore performs the export.

One resource may bind more than one datastore. This is not hypothetical: ngdpbase already splits bulk content from operational data across `SLOW_STORAGE` and `FAST_STORAGE`, so a pages provider needs `pages.content` and `pages.index` as separate bindings.

### A driver is an implementation, not a parameter

SQLite and Postgres are different provider implementations, not one implementation with a dialect flag. Their differences do not stay behind a parameter — encrypted export is `sqlcipher_export()` against `pg_dump`, integrity checking has no common mechanism, and concurrency and retry semantics diverge. A dialect flag guarantees the leak this document already names in the Go stack, where a handler branches on `gorm.ErrDuplicatedKey`. The connection string is a parameter; the engine is an implementation.

The same holds one layer up. A filesystem pages provider and a SQL pages provider are different designs, not one design configured twice: `page-index.json` exists only because a filesystem cannot answer "every page by title" without a scan, and against SQL it should not exist at all. An object-store pages provider is a third design again, because it has no atomic rename and no cheap listing.

### What is true when this is reached

Each of these is falsifiable, which is the only reason to write them down:

- Every read and write of a resource passes its manager, and a lint rule fails CI if anything else imports a store or a driver. Delete the rule, prove CI goes red.
- A request that writes through two managers either lands both, or loses only the audit record and __says so where an operator will see it__. Which of those is acceptable is a per-resource judgement, not a global rule — see below.
- Turning on encryption for any resource is a configuration change and touches no provider code.
- Every manager answers `backup()` and `restore()`, and a default install has a working backup with encryption on.
- A capability that is not configured is not loaded; a required one that cannot be loaded refuses the boot rather than degrading to inert.
- The application is built with zero edits to framework files, and the count of exceptions is collected rather than estimated.

### Two writes, one request

A resource has one door. A *request* often crosses several: writing a record and writing the audit entry that says it happened are two managers, two stores, and no boundary around the pair.

__This is not a database problem, and framing it as one is the mistake to avoid.__ It does not arrive with SQL or with transactions. It arrives with __the second store__, and both stacks already have one — ngdpbase writes a page file and an audit log, and has since audit events were added. A transaction is one possible *answer*; the question is what happens when a request must land two writes and only one lands.

__The decision, for audit specifically: the write wins, and the loss is made visible.__

Audit writes are fire-and-forget with a caught error. Losing the log is bad; refusing a page save or a credential mint because the log failed is worse — it converts a recording problem into an outage. So the request completes and the audit entry may not.

That is a real cost and it points one way: not "an audit entry describing a write that never happened", but __a write with no audit entry__. For a page edit that is a gap in history. For a credential it is worse, because knowing the token exists is the entire reason to audit the mint.

The trade is only defensible if the loss is __observable__. An accepted risk nobody can see is indistinguishable from an unnoticed bug, which is the failure shape this project keeps finding. So dropped audit writes are counted since boot, the most recent is described, the first loss and each power of ten are logged at error level, and the count is surfaced on the admin audit page — where it appears only when something has actually been lost.

__What this does not settle.__ Where an unaudited action is genuinely unacceptable, the answer has to be atomicity rather than observability, and that needs an owner for the unit of work: the engine, or the datastore binding the two providers share. Note the second cannot span the tamper-evidence case — PHI local, audit off-box — by construction. That remains open in [#1109](https://github.com/jwilleke/ngdpbase/issues/1109).

For a PHR the bar is higher than for a wiki: [yourphr#507](https://github.com/jwilleke/yourphr/issues/507) makes audit a __required__ capability that refuses to boot, on the principle that an unaudited disclosure did not happen. A system holding that line cannot also quietly drop audit records for disclosures that did. So this decision is inherited as a __starting point with a known exception__, not as settled law.

### Known gaps against this target

Recorded so the distance is visible rather than implied:

| Gap | Where it stands |
|---|---|
| Atomicity across managers | Partly decided — see [Two writes, one request](#two-writes-one-request) below and [#1109](https://github.com/jwilleke/ngdpbase/issues/1109) |
| `DatabaseManager` is singular; the target needs named, plural datastores | Shaped for one connection, with a public `handle` getter marked "composition root only" and enforced only by a comment |
| Encryption and egress as binding attributes | Today a global `database.encryption.enabled` flag, asked of configuration rather than of the component holding the key |
| The store-boundary lint | Not written. Until it exists, the invariant is documentation, and documentation decays while the tests stay green |
| Cross-manager backup quiescing | Named in this document as engine-level work, still to be designed |

## DEFAULT TO ngdpbase

__Read `/Volumes/hd2A/workspaces/github/ngdpbase` — the code, not its docs — and default to what it does.__ It is checked out locally. When this stack needs a mechanism ngdpbase already has, take ngdpbase's shape as it is built, even where something else looks tidier.

__Improvements are FILED, not built in flight.__ A better idea found mid-implementation becomes an issue against the adopted shape. It does not become a structure invented on the spot, because the next problem then gets solved on top of the invention, and three layers later nothing matches the framework any more.

__A divergence is only legitimate if this document names it__ — see [Five mechanisms to tighten while copying](#five-mechanisms-to-tighten-while-copying), each of which states the ngdpbase weakness it fixes. Anything else is an invention. The test before writing code: __does this document name this divergence, or am I about to create one?__

Nothing in the code, the configuration, the tests or the deployment says "spike". That word was scaffolding for the transition, never the product. This stack becomes YourPHR; the Go stack goes silent.

Companion to [`strategy-typescript-transition.md`](strategy-typescript-transition.md) (what is being built and when) and [`authorization-framework.md`](authorization-framework.md), which already derives from ngdpbase's `WikiContext` and `PolicyEvaluator`.

## Why adopt rather than invent

Two reasons, and only two — both worth stating so the adoption stays honest rather than reverent.

__It is the same author's solved problems.__ ngdpbase is 101.5k lines of TypeScript with 38 managers and 36 providers, built by the person who will maintain this. Its patterns are already familiar, which for a single maintainer is an architecture constraint rather than a preference.

__One of its ideas has already paid off here.__ The mail transport ([#536](https://github.com/jwilleke/yourphr/issues/536)) took ngdpbase's `console` provider default: with no relay configured, a message is logged rather than failing. That collapsed an entire planned phase — "what happens when SMTP is not set up" — into a default value. It was a better answer than the one this project had reasoned its way to.

## The model

The whole architecture, stated without reference to records, wikis, or any particular resource. Everything after this section is application.

1. __A resource has exactly one manager, and no other path reaches it.__
2. __Context is request-scoped and says who is asking.__ It is passed into managers; managers are not reached through it.
3. __Managers decide and act. Providers implement and return.__ A provider reports a result; only the manager turns that result into an effect.
4. __Configuration binds capabilities to providers; providers supply behaviour.__ Config selects and parameterises. It never expresses logic.
5. __A capability that is not configured is never loaded.__
6. __Every action on a resource is a named permission__, declared as data in one registry: `{target}-{action}`.
7. __Roles collect permissions.__ Nothing more — a flat list, additive only.
8. __Capability and scope are separate.__ A role says *what* may be done; the assignment says *over which subjects*. Neither is ever encoded in the other's name.
9. __Evaluation is tiered, and the resource's own attributes beat global policy.__ That is how "everything except" is expressed without deny entries.
10. __Decisions come in two forms__: one item, or a filter over many. Both are part of the contract, because a list endpoint that improvises its own check is a hole. The mechanism ([#1116](https://github.com/jwilleke/ngdpbase/issues/1116)), in three clauses: __(a)__ a caller supplies __facts about who is asking__ (its principals or username), never __the conclusion__ (an `includeAll`-style bypass flag) — the deciding side derives the bypass from the facts, so a caller cannot be wrong about it; __(b)__ every list/search method takes those facts as a parameter and narrows __inside the door__ — the manager or provider that owns the resource, never the route; __(c)__ a resource whose list cannot be narrowed per-record __refuses without an authorized caller__ rather than returning everything — an unfiltered list must be distinguishable from a list that had nothing to hide. Applied to `getRecentChanges` (the flag shape leaked private titles through a plugin any viewer could reach), to `AppHealthPlugin`'s orphan/stale reports, and to `AuditManager`'s query methods (clause c: gate-or-nothing, verified against UserManager inside the manager). The compile-time-enforced form (`Narrowed<T>`) is deliberately deferred to the Records phase, where forgetting must fail at compile time.
11. __Access without an account is a principal, not a bypass.__ A share token resolves to a subject and goes through the same evaluator.
12. __Every one of these is an invariant, so every one needs a check that fails.__ A rule enforced only by documentation decays silently, while the tests stay green.

Points 6 through 11 are enforceable only because of point 1: without exactly one door, none of them can be relied on.

## The goal is a reusable framework

The intent is a core that is __architecturally complete and customised through providers and configuration rather than forked code__. That is a different target from "an application built well", and it changes one of the tests below, so it belongs here rather than as an afterthought.

__Why the timing is right rather than premature.__ Framework extraction fails when it is done up front, or from two similar applications. ngdpbase is application one and already exists; YourPHR is application two, in an unrelated domain. A wiki and a medical-records system sharing a core is a hard test — seams that survive that gap will survive most things.

__Where the framework must stop.__ It cannot know what a compartment is, or what FHIR is, yet the evaluator needs scope. So `resource → scope` resolution is an __application-supplied extension point__. If page-ness is hardcoded anywhere in the evaluator, YourPHR forks on day one and the framework is fiction. That single seam is the test of whether any of this is real.

| Framework owns | Application supplies |
|---|---|
| Engine and lifecycle, config system, manager and provider base contracts, auth, policy evaluator, audit, users/roles/sessions, backup and restore contract, share tokens, the permission registry *mechanism* | Its resources and their managers, the permission registry *contents*, its scope resolver, its providers, its UI |

__The extension path must be the path the built-ins use.__ From ngdpbase's own `AuthManager`: *"Addons register through the same method, so the contributed path is the one exercised on every boot rather than a second, less-travelled one."* If built-ins take a privileged shortcut, the path adopters depend on is the path nobody tests.

__Give it a falsifiable test__, in the spirit of [#539](https://github.com/jwilleke/yourphr/issues/539)'s stop rule, because "architecturally complete" is otherwise a feeling: __can YourPHR be built with zero edits to framework files?__ Count the patches. Each one is a seam in the wrong place — useful data, but only if somebody is counting.

__The cost, stated rather than discovered:__ two consumers means a breaking change hurts twice, so the base contracts need a stability guarantee and real versioning. And YourPHR's migration becomes coupled to framework churn on top of the Go freeze and a dated stop rule — three concurrent projects, when the freeze is already the fragile part. Mitigation: __copy the pattern into YourPHR first, extract the package second.__ The seams are learned from two implementations in hand; predicting them is where frameworks die.

## The invariant

__All code that touches a resource goes through that resource's manager. There is no second path.__

Everything else here follows from that one rule. The lifecycle, the backup contract, the providers, the policy evaluator — none of them is the idea. They are what becomes *possible* once a resource has exactly one door.

For a system holding medical records this is not a tidiness preference, because four things a PHR must do are only truthful if the chokepoint is real:

- __Access logging.__ "Who read this record" is answerable only if every read passed one place. A single path that reaches around does not make the audit log *incomplete* — it makes it __wrong__, and wrong silently, which is the failure shape this project keeps finding ([#527](https://github.com/jwilleke/yourphr/issues/527), [#528](https://github.com/jwilleke/yourphr/issues/528)).
- __Authorization.__ A policy evaluated at the door is enforced. A policy evaluated in 25 handlers is enforced 25 times and bypassed by the 26th.
- __Backup and restore.__ A manager can answer "how are you backed up" only because it sees every write. This is why the base contract can demand it at all.
- __Encryption.__ Same argument, same door.

### What follows: the base contract

`BaseManager` requires `initialize(config)`, `shutdown()`, __`backup()`__ and __`restore()`__ — and `BaseUserProvider` repeats `backup`/`restore` as abstract at the provider layer, so neither level can exist without answering it.

Compare where YourPHR is: backup is a feature that happens to exist, and it is __mutually exclusive with database encryption__ ([#367](https://github.com/jwilleke/yourphr/issues/367), [#461](https://github.com/jwilleke/yourphr/issues/461), [#363](https://github.com/jwilleke/yourphr/issues/363)).

The reason is sound rather than an oversight. From `pkg/database/backup.go`: `VACUUM INTO` *"would write a PLAINTEXT snapshot of an encrypted DB (PHI leak), and a restore couldn't be opened with the cipher key — neither is handled yet. Refuse rather than silently leak/break."* Correct call. But it composes badly with encryption defaulting __on__ ([#470](https://github.com/jwilleke/yourphr/issues/470)): two individually-right decisions produce a default install with __no backup at all__, which is an outcome neither of them intended.

A database provider owning the connection resolves it, because the component holding the key is the only one that can export correctly. SQLCipher's mechanism is not `VACUUM INTO` but `ATTACH DATABASE … KEY …` followed by `sqlcipher_export()`, which writes an encrypted, consistent copy — and can write it under a *different* key, so backups can be encrypted to a key the operator holds separately from the running instance. That is precisely what off-box `audit.storage` wanted.

Today backup asks a global flag (`database.encryption.enabled`) rather than asking the component that owns the connection. That is the invariant restated: the question belongs at the door.

Four obligations come with it, or the fix is illusory:

- __KDF parameters travel in the artifact__ — cipher, iteration count, page size, salt handling; never the key. Otherwise restore onto a fresh install fails even with the right passphrase, at the worst possible moment.
- __Backups are key-versioned.__ Rotate the passphrase and every earlier backup needs the earlier key, so the artifact records which one it was written under.
- __There is a recovery story.__ An encrypted backup nobody can restore is *worse* than no backup, because it looks like protection until the day it matters. This also collides with the operator's own position on export — records a user cannot open in ten years without a key they have lost are not meaningfully theirs.
- __A deliberately-plaintext export stays available, loudly warned.__ Remove it and people will copy the `.db` by hand, at the wrong moment, producing exactly the torn file that `VACUUM INTO` exists to avoid.

__Known gap the base contract does not close:__ per-manager `backup()` yields a *torn* snapshot across managers — records at one instant, config at another, audit at a third. Tolerable for a wiki; for records it means restoring a state that never existed. Each manager can answer for itself, but quiescing and ordering is engine-level work that still has to be designed.

### Where YourPHR already stands, and where it leaks

Go is closer to the invariant than expected: `DatabaseRepository` is a 69-method single path for records. Two known breaks:

- `pkg/web/demo_reset.go` calls `gorm.Open` and holds __its own connection__ — a real second door to the same data.
- `pkg/web/handler/users.go` branches on `gorm.ErrDuplicatedKey` — not a second path, but the abstraction leaking its implementation's error vocabulary to a caller, which quietly welds the handler to GORM.

### The invariant has to be enforced, not documented

A rule that lives only in a document decays at the first deadline, and its decay is invisible — the code still works, the tests still pass, and only the audit log is quietly lying. So the boundary needs a lint rule: __only `managers/` may import the store or the driver__, with everything else importing managers. Then the check earns its place the way every other harness here has: delete the rule, prove CI goes red.

### What follows: capabilities are pluggable providers, with an inert default

ngdpbase pairs each capability with an interface and several implementations, chosen by config: auth (`Password`, `MagicLink`, `Authentik`, `CloudflareAccess`, `GoogleOIDC`, `AgentToken`), search (`Lunr`, `Elasticsearch`), cache (`Node`, `Redis`, `Null`), audit (`File`, `Database`, `Cloud`, `Null`), storage, media, attachments, backup.

Two properties matter more than the list:

- __A `Null` or `console` provider is the default.__ The system is never broken for want of configuration; it degrades to inert. That is what made mail safe to ship half-finished, and it is why the public demo cannot email strangers by accident.
- __Registration is gated on a config key__, so an unconfigured capability is *absent* rather than half-present.

### Capability, not provider type

A capability is one job — audit storage, PHI storage, cache, search index. A provider type is a reusable implementation of that job. The __binding__ is what configuration chooses, and the same type can be bound several times with different settings:

```text
phi.storage        → filesystem
audit.storage      → s3
backup.storage     → s3          (different bucket, different credentials)
attachment.storage → filesystem
```

"One active" applies to a binding, never to a class. And this composition is not merely permitted — it is often the better architecture. Keeping PHI on the family box while shipping audit off-box is __tamper-evidence__: an attacker who owns the machine can rewrite a local audit log and erase what they did. An audit trail the local administrator cannot alter is the entire point of having one.

Which argues for __finer capabilities in the framework__. A single `StorageProvider` means PHI and logs can never be separated and the operator has no lever at all; four named capabilities means they can compose.

__Every storage binding is independently a data-egress decision.__ `phi.storage.provider = "s3"` relocates medical records to Amazon, and in a config file it looks identical to choosing a cache backend. The same care applies to the audit example above: an entry reading *"user X read Alice's Condition/123"* is disclosive on its own, so off-box audit means off-box __and__ encrypted client-side, or off-box to storage the operator controls.

So the config system needs a third marker alongside the existing `secret` list: __keys whose value moves PHI off the machine.__ Loud in the admin UI, defaulted local, and never altered by an upgrade that finds the default untouched. A PHR whose premise is that records stay in your house must not lose that to a one-word edit that reads like a backend choice.

### Cardinality is a property of the capability

Four kinds, and two of them look identical until they are wrong:

| Cardinality | Examples | On failure |
|---|---|---|
| __One active__ | PHI storage, cache, search index | Capability is down |
| __Any-of__ (alternatives) | password *or* OIDC *or* magic link | A failed login — never a silent fallback to the next provider, which turns a lockout into an oracle |
| __All-of__ (factors) | password *and* TOTP | Denied |
| __Broadcast__ | audit sinks, notifications | See below |

For a capability that is *one active*, switching providers is a data migration — and `backup()`/`restore()` from the base contract is exactly that path. The contract adopted for disaster recovery turns out to be the filesystem-to-S3 move as well.

__The hazard is between any-of and all-of, and it is live in ngdpbase today.__ `ngdpbase.auth.required-factors` is an ordered list meaning *all of these*, six providers are registered simultaneously as alternatives, and the manager's own header says *"Currently single-factor only; multi-factor state management is deferred."* Whoever implements MFA must satisfy every entry in order: wiring it as "try each until one succeeds" turns multi-factor into a bypass, because the attacker simply presents the factor they hold. Same list, same providers, opposite security property — worth a test written before the feature.

__Broadcast failure is a policy decision, not a default.__ If an audit sink is unavailable, does the operation proceed? For records the answer is that a disclosure which was not audited did not happen: refuse the export or the share rather than complete it unlogged. Wrong for a wiki's page views, right for PHI leaving the system.

### Not configured means not loaded

Skipping instantiation saves almost nothing — an unused manager object is a few kilobytes. Skipping the __module__ saves a great deal, because the cost is the dependency it drags in: an image toolchain, a headless browser for PDF rendering, a Redis or Elasticsearch client. Tens to hundreds of megabytes resident, plus native initialisation at boot.

So the gate must be a __dynamic `import()` inside the factory__. A top-level `import` of the implementation defeats config gating entirely — the module loads and its native bindings initialise regardless, and the config key only decides whether it is called. That distinction is the whole feature and is invisible in review unless looked for. This matters because the deployment target is a family box, not a datacenter.

__The stronger argument is not memory, it is attack surface.__ Code that never loads cannot be exploited. An instance with no connected sources should not have the SMART client and its URL-fetching path live at all — and that is the component carrying the SSRF guard already flagged as the most dangerous item in the migration. "Not installed" beats "guarded".

Two traps:

- __Absent must not mean null.__ If `getManager('image')` returns null, every call site needs a check and the one that forgets crashes on real data. Keep the capability addressable and make the *implementation* inert; the saving already happened by not importing the real module. No caller branches — the same disease as 25 scattered admin checks.
- __Absent must be visible.__ An install where a feature silently does nothing because a config key is missing is indistinguishable from a bug. Log the resolved provider set at boot. That is the mail lesson: inert is fine, inert *and invisible* is a support ticket.

### Where configuration lives

Everything above names configuration keys without saying where they come from. Two files, one merge, and the order is the whole of it:

```text
config/app-default-config.json        ships with the product — required, read-only, never written at runtime
<data>/config/app-custom-config.json  the instance's overrides — optional, written by Admin -> Configuration
SPIKE_* / YOURPHR_* environment       bootstrap and secrets ONLY (yourphr#472)
```

Later overrides earlier. This is ngdpbase's model verbatim (`ConfigurationManager.ts`, "Configuration merge order (later overrides earlier)"), with the environment layer added on top because a container has nowhere else to put a database key before an admin exists to type one.

__The shipped file is the catalogue of what this release understands.__ Read-only is not a convenience: it is what lets a later release change a default and have that change actually reach installed instances. An instance that has never overridden a key follows the product; one that has, does not, and can say exactly which keys those are.

__The overlay holds only what the operator changed — never the merged view.__ This is the rule most worth defending, and it is not theoretical. ngdpbase shipped the bug it prevents and had to add an escape hatch around its own merge: `ConfigurationManager.getDefaultProperty()` exists, per its own comment, to *"read a property from the SHIPPED defaults only, ignoring instance custom-config overrides ... whose seed must not be shadowed by legacy whole-catalog snapshots in instance config (the #895 propagation bug)"*. An instance had written back a whole catalogue rather than its deltas; every later shipped entry was then shadowed entry-by-entry, and the deep merge did not save it, because a merge cannot tell a deliberate override from an accidental snapshot. Writing deltas is what keeps that distinction real.

__Values live in the JSON; meaning lives in code.__ These are different things and fusing them is what made this question look harder than it is. The file carries a key's *value*. The compiled catalogue carries what the key *means* — its description, whether it is a secret, whether it is bootstrap-only, whether changing it needs a restart. Meaning is a property of the release, not of the instance, so an operator cannot edit it and a release upgrade updates it for free. ngdpbase keeps documentation in sibling `_comment_*` string keys instead, which is honest but unreachable from code: nothing can render it in an admin screen, and nothing can check that a key was described at all.

That split is also what makes structured values safe. A key whose value is an object — the permission registry, the role definitions — merges __per entry inside the object__, not whole-value, so an operator who overrides one role does not freeze the rest against every role shipped afterwards. The same discipline applies to the write path: __Admin -> Configuration must persist the entries the operator actually changed, never the merged object it was rendering.__ Getting this wrong is `#895` again, one level down, and it will look like the feature working right up until the next release.

__What YourPHR keeps that ngdpbase does not have.__ These are not divergences to justify; they already exist in the spike's config store and are cheap to carry:

- __Per-key descriptions__, so an undescribed setting is unfindable in the admin UI and a reviewer notices the omission.
- __Unknown keys are reported, never silently carried or dropped__ ([#473](https://github.com/jwilleke/yourphr/issues/473)) — a typo'd key that vanishes teaches the operator the setting "does not work".
- __Secret-flagged keys never leave the snapshot unmasked__, and __bootstrap keys are environment-only__ — they must hold before any admin exists to have set them.
- __A key pinned by the environment is read-only to the admin screen__, answered 409 rather than accepted, because env wins at read time and storing the write would keep a value that never applies.
- __Uniform environment naming.__ `auth.session.sliding-seconds` is `SPIKE_AUTH_SESSION_SLIDING_SECONDS`, derived. ngdpbase's `getProperty()` carries a hand-maintained table of six env overrides, so any key not on that list cannot be set from the environment at all and nothing says so.

__What this buys, immediately.__ Once the two files exist, things that looked like architecture become ordinary keys. The permission registry and the role definitions are two entries in the shipped defaults, overridable per instance and editable in Admin -> Configuration — which is how ngdpbase already carries them (`ngdpbase.permissions.definitions`, `ngdpbase.roles.definitions`). No new mechanism is required to let an operator define a caregiver role; the mechanism is the config system, and this section is the part that was missing.

Two constraints follow, and both have precedent rather than being invented here:

- __A permission name an operator grants must be one the code enforces, checked at boot.__ Configuration decides *who may do what*; it does not get to invent an act. A role granting a permission nothing checks is a grant that silently means nothing, which is the same family as configuration claiming S3 while the manager writes to disk. Refusing the boot is the answer, per the required-capability rule above. ngdpbase validates on load for the same reason — `PolicyValidator.ts` is 904 lines of it.
- __One list, not two.__ ngdpbase's own config carries the warning: its role definitions' inline `permissions[]` arrays are display-only, while `PolicyEvaluator.evaluateAccess()` reads `ngdpbase.access.policies`, and the two are held together by a comment instructing the next editor to keep them matched. The list the admin screen renders must be the list the evaluator reads.

### How a manager gets its provider

Each manager selects its provider from configuration at `initialize()`. ngdpbase implements this by convention, and the convention is worth taking as-is:

```text
ngdpbase.audit.provider              → the selection
ngdpbase.audit.provider.default      → the fallback
ngdpbase.audit.provider.cloud.*      → settings for one provider
```

Status of each refinement below against ngdpbase as it stands today:

__Dynamic import — implemented.__ `AuditManager.loadProvider()` does `await import(\`../providers/${this.providerClass}.js\`)`, so an unselected provider's module genuinely never loads. The principle above is not aspirational; it is running code.

__Central resolution — not implemented.__ Every manager repeats the same sequence itself: read the key, apply the default, normalise the name to PascalCase, dynamic-import from `../providers/`. It works and it is consistent, but it is a convention rather than a mechanism, so it is enforced by everyone remembering. One factory mapping `(capability, config) → instance` removes the repetition and makes a fake injectable in tests without touching config files.

__Fail-fast — not implemented, and the opposite is deliberate.__ This is the one place YourPHR must diverge. `AuditManager` falls back to `NullAuditProvider` __on any load error and on a failed health check__, logs a warning, and boots successfully:

```text
Failed to load audit provider: <class>
Falling back to NullAuditProvider due to provider load error
```

For a wiki that is sound resilience — page serving should survive a broken audit sink. For medical records it is the exact failure shape this project keeps finding: a typo in a provider name, or a bucket unreachable at boot, and the system runs normally __with auditing silently off__. The doc's rule that an unaudited disclosure did not happen is worthless if the audit provider can quietly become inert at startup.

The rule that resolves it is per-capability rather than global, because falling back to inert is right for an image viewer and wrong for an audit trail: __a capability declares whether it is required. Optional capabilities fall back to inert and log; required capabilities refuse to boot.__ ngdpbase already has the refusing behaviour where it matters — the magic-link provider *"refuses to register unless [`base-url`] is set explicitly, because a token in a URL is a credential and must not point at the localhost default."* So the precedent exists; it is the default that differs.

__Boot ordering — implemented as an explicit list, with no validation.__ `WikiEngine.ts` registers managers in hand-written source order, `ConfigurationManager` first. That is simple and it works, but the dependency graph is implicit in line order and nothing checks it. A manager initialising before the config it reads does not crash — it silently takes defaults, which is worse.

__Shared versus per-capability instances — not addressed, because ngdpbase has no equivalent case.__ YourPHR does. RecordManager, UserManager and a database audit sink all need the *same* SQLite connection, not three. With SQLCipher each connection pays a key derivation, and the KDF is deliberately slow — several managers each paying it at boot is a visible delay on a family box for no benefit. So the shape is two-tier: __shared infrastructure providers__ (the database handle) resolved once by the engine and handed to managers, versus __per-capability providers__ (`audit.storage`, `attachment.storage`) resolved per binding. The accidental version is everyone constructing their own, and it is slow in a way that looks like a mystery.

__Restart-required marking — not present.__ ngdpbase's config carries no such marker. YourPHR needs one, because [#472](https://github.com/jwilleke/yourphr/issues/472) lets settings change in the admin UI without editing YAML, so somebody will switch `audit.storage` from filesystem to S3 at runtime. Either the manager re-initialises or the UI says restart required — the outcome to prevent is configuration claiming S3 while the live manager keeps writing to disk. Stated and actual configuration disagreeing silently is the same family as the NULL counters ([#528](https://github.com/jwilleke/yourphr/issues/528)). Marking provider-binding keys restart-required costs one label; hot rebinding a storage provider mid-write is a great deal of machinery for a family box.

### Providers keep the invariant from producing god objects

Providers are also what keeps the invariant from producing god objects. "One door" is not "one pile": ngdpbase's own `UserManager` is 1,600 lines carrying password hashing, permission resolution, Express middleware and wiki page creation, with three role methods already gutted to `never` after the split to `RoleManager`. That is what happens when a single path is read as a single class. The manager is the __gate__; the provider is the implementation behind it.

### What follows: policy is data, evaluated — not conditionals scattered through handlers

`PolicyManager` + `PolicyEvaluator` + `PolicyValidator`: allow/deny policies as objects, validated on load, evaluated against a context.

YourPHR today has __25 in-handler admin checks across 7 files, reached through two duplicate helpers__ ([`authorization-framework.md`](authorization-framework.md)). A third role would mean revisiting 25 sites, each an independent chance to be wrong.

__Adopt:__ policy-as-data with an evaluator. The validator matters as much as the evaluator — a policy store that accepts a typo is a policy store that silently widens access to medical records.

## The layering: context, manager, provider

Three layers, one job each.

- __Context__ is request-scoped. It carries the engine, the current user, and the request/response — *who is asking, in what request*. It is passed __into__ manager calls.
- __Manager__ is the door to a resource. It decides, enforces policy, audits, and turns a provider's result into an effect.
- __Provider__ does the actual work and __returns a result__. It does not act on it.

That last ordering is what makes auditing trustworthy. Because the provider only reports, the manager is the single place where a success becomes a session, an audit entry, a counter bump. Two providers cannot each write half a story.

### Context is request-scoped, not session-scoped

A session outlives a request, so authorization facts held for the length of a session go stale inside it: a role is revoked, an account disabled, a password changed, and a long-lived context still says admin. Build the context fresh per request from session state, and keep session state behind the user provider.

Two kinds of thing live in it, with opposite safety needs:

- __Authorization facts__ — subject, roles, compartments, token generation. Built once at the edge and then __immutable__. If a handler can write to it, a handler can widen its own permissions.
- __Request incidentals__ — locale, timezone, theme, user agent, client IP. Mutable, harmless.

ngdpbase's `WikiContext` places them side by side and marks all of them optional: `authenticated?: boolean` sits next to `dateFormat` and `activeTheme`. Since `undefined` is falsy, a missing value fails closed *by luck* rather than by design. For a wiki that is fine. For medical records, failing closed by accident is one refactor away from failing open — so the authorization fields should be required, not optional.

__Holding the engine on the context is fine.__ The risk was never `ctx.engine`; it is `ctx.engine.getManager('records').db` — reaching *past* a manager to the store. That is what the lint rule above forbids. Engine-on-context plus an enforced store boundary is coherent, and threading the engine separately would be more ceremony for the same guarantee.

### Authentication returns a result, not a boolean

`authenticated: true | false` discards what the manager needs next. ngdpbase's own `AuthResult` is already richer than a boolean, and the comment explaining why it grew is the useful part: the manager always passed `viaToken` along, but the type did not admit the field existed, so a provider that misspelled it still compiled and silently delivered nothing.

For records the result should carry the subject, which provider authenticated, which factors were satisfied, issued-at and expiry, and the __token generation__. That last one is [#528](https://github.com/jwilleke/yourphr/issues/528) exactly: *"this session should end because the password changed"* is unanswerable if authentication returned `true`.

## Authorization

### Permissions are `{target}-{action}`

The registry format ports unchanged — target first, hyphen separated, URL-safe. ngdpbase defines 19 across five targets (`admin`, `asset`, `page`, `search`, `user`).

Two of its choices are already right for records and were arrived at independently here:

- __`page-export` is separate from `page-read`.__ Reading one record on screen and extracting the whole chart to a file are different acts with different risk — access versus disclosure. The split is not a PHR special case; it is already in the registry.
- __`search` is a target, not an action.__ Search leaks *existence*: being told "3 results you may not open" already discloses that the records exist.

A first cut for YourPHR:

```text
record   read export share annotate edit delete
source   read connect sync delete
user     create read edit delete
admin    read roles system
search   record
```

`record-share` is split from `record-export` because share crosses the trust boundary and export lands on the operator's own disk. `record-edit` is kept rather than omitted, and constrained at the resource level instead — see the provenance lock below.

### Roles are a flat list of permissions

A role is a list of permission strings and nothing more — `editor = [page-read, page-edit, page-create, …]`. Flat (no roles inside roles), unordered (no entry beats another), and __additive only__ (every entry grants; none takes away).

Two of ngdpbase's role decisions are worth taking directly:

- __`issystem`__ separates built-in roles from operator-created ones, so an admin cannot quietly redefine what a role means. That is worth more for records than for pages.
- __`anonymous` is a role__, not an `if` somewhere. The unauthenticated path goes through the same evaluator with a near-empty permission list — the single-path invariant applied to the case where the special-case branch usually hides.

Its `demo-admin` role — sees every admin screen, changes nothing, cannot see the user list — is exactly what YourPHR's public demo needs and currently handles ad hoc.

__Where a flat list runs out:__ it says *what* may be done, never *whose records*. That is the compartment, below. And because it is additive only, it cannot express "everything except" — which the tiered evaluator answers instead of deny entries.

### Compartments are whose records, not which actions

__A compartment is every resource about one person__ — Alice's Conditions, Observations, MedicationRequests, Encounters and Claims, across all resource types. The word is FHIR's, not ours, and the spec defines per resource type which field links a record back to its subject (`Observation.subject`, `Condition.patient`, and so on), so "is this record in Alice's compartment" has a defined answer rather than a guessed one.

__YourPHR already has one; it just is not named.__ The `user_id` column does this job today, and the spike proved that isolation holds 6/6. The concept only starts earning its keep when user and patient stop being one-to-one — family sharing, where one person reaches several compartments: their own, a minor child's, an aging parent's.

It is the right unit because the alternatives fail plainly: per-resource grants explode and need a new row for every record that arrives tomorrow, and granting by resource type is the wrong axis — nobody grants "Observations", they grant a person's chart. A compartment covers what has not arrived yet, and turns into a query predicate rather than thousands of individual decisions.

(Shared reference data — Practitioner, Organization, Medication — belongs to no compartment, so its readability is a separate question.)

__Scope never goes in a name.__ Not `record-read-patient-123` as a permission, and not `guardian-of-alice` as a role. Both explode combinatorially and neither can be listed in a config registry. The role stays compartment-free and the __assignment__ carries the scope: `(grantee, role, compartment, granted_by, expires_at, revoked_at)`. At family scale that is a small table, not a distributed authorization system.

### The evaluator is tiered, and resource-level attributes win

ngdpbase evaluates in tiers — __author-lock, then the resource's own audience/access, then global policies__ — with resource-level attributes overriding the global ones.

This is the answer to "everything except", and a better one than adding deny entries to role lists. Sensitivity is a property of *the record*, not of the grant, so it belongs on the record. Two resource-level controls port directly:

__`audience` becomes confidentiality.__ This is where adolescent confidentiality and 42 CFR Part 2 substance-use protections actually live, and FHIR already has the slot — `meta.security` confidentiality codes, plus `Observation.category`. A record marked restricted overrides a guardian's compartment grant, without every grant having to enumerate what it must not reach.

__`author-lock` becomes a provenance lock.__ Patients legitimately edit records they authored themselves — a home blood-pressure reading, a note. They must never edit a record imported from a provider, because the record still carries that provider's provenance. One mechanism covers both cases, which is why `record-edit` survives as a permission.

__One deliberate divergence:__ ngdpbase's author-lock denies everyone except admin. For records there should be __no override at all__. An admin fixing a wiki page is maintenance; an admin editing an imported lab result is falsifying a clinical record that still claims a provider as its source.

### Deciding one record and filtering many are both first-class

A wiki decides one page per request. A record list asks about thousands. If the evaluator only offers `decide(ctx, action, resource)`, list endpoints will grow their own path — and that path will not be audited.

So both forms are part of the contract:

- `decide(ctx, action, resource)` for a single record
- `filter(ctx, action, query)` — policy compiled into a __query predicate__ for lists

This is not a hypothetical risk. ngdpbase shipped exactly this leak ([ngdpbase#1054](https://github.com/jwilleke/ngdpbase/issues/1054), fixed 2026-08-16). `VersioningFileProvider.getRecentChanges` consulted `audience` only on already-private pages, so __a non-private page with an audience was listed to viewers who got a 403 on opening it__ — 347 of them on the maintainer's own instance. Note the layer: the leak was in a *provider* reimplementing a check the *manager* owned, which is the same boundary this document draws between deciding and implementing.

Two details from the fix are worth carrying over, because both are cheap to get wrong here:

- __A denormalised copy of an authorization attribute goes stale.__ The page index cached `audienceRoles` at write time "for index-level access checks", so any page not re-saved since the field was added showed an empty list — 345 of the 347. The fix reads the record's own attributes and treats the index as an enumeration aid only. For a PHR the equivalent is any confidentiality flag cached outside the record.
- __The same stale field made a second caller fail the opposite way.__ `getPagesSharedWith` *under*-reported, hiding 345 pages from "shared with me". One wrong source, one over-disclosure and one silent omission — which is the argument for a single evaluator rather than per-caller reimplementation, stated more sharply than a leak alone makes it.

The resolution was to extract tier-1 evaluation into one shared function that the manager and both listing paths call. That is `filter()` in all but name, arrived at by necessity — the strongest available argument for making it a first-class form here rather than something each list endpoint improvises.

### Sharing without an account

ngdpbase's share routes — `/share/:token`, plus `/file/:id`, `/thumb/:id`, `/page/:name`, with create and revoke management — are the shape [#524](https://github.com/jwilleke/yourphr/issues/524) needs: giving a new specialist read access to part of a chart without them holding an account. SMART Health Links standardise exactly this for health data and should be followed rather than reinvented.

__A separate route tree is structurally where the second door appears.__ Those handlers must resolve the token into a *principal* and then go through the same evaluator. If they answer access questions themselves, everything above is decoration.

What records demand beyond what a wiki needs:

- __A token in a URL leaks by design__ — history, referer headers, proxy logs, and chat platforms that fetch pasted links to build previews. SHL's answers apply: short expiry, a passcode delivered separately, a short-lived manifest rather than the content itself.
- __Every use is audited__, on every route and not only the landing one. A share fetch is a disclosure — arguably the most audit-worthy event in the system.
- __Revocation is immediate__, and a share is bounded by compartment *and* confidentiality rather than being all-or-nothing.

### Keeping the registry honest

The registry and the enforcement points are two lists that must agree, and nothing checks that they do. In ngdpbase's config each permission carries an `icon` and a `color`, which reveals the registry's day job is rendering the admin screen while enforcement lives at scattered call sites.

So the harness, in the spirit of everything else here: __assert that every permission in config is checked somewhere in code, and that every check names a permission that exists in config.__ It catches drift in both directions — an orphan permission that protects nothing, and a check spelled `record-view` when the registry says `record-read`. One fails open and looks fine; the other fails closed and also looks fine.

The related split: __the action vocabulary belongs to code__ (a permission string no code path checks is inert — it looks like protection and is not), while __role-to-permission bindings belong to config__, where they are genuinely deployment policy.

### None of this binds today

YourPHR is one user, one account, with per-user isolation. Compartments, guardianship, confidentiality tiers and sharing all arrive with __family sharing__, which is not built. The ask now is narrower: do not let the evaluator's shape foreclose them. An evaluator that can only add permissions together is a decision, even when it is made by not deciding.

## The manager set

Applying "one manager per resource" to YourPHR's actual tables. Derived from the persisted models and the 69-method `DatabaseRepository` interface, not from ngdpbase's roster.

__The thing to get right first: 70+ FHIR resource types are *one* architectural resource.__ Condition, Observation, Claim and MedicationRequest are rows in the record store, not resources with doors of their own. The spike already established that this is the correct axis — 551 generic lines replacing 18,518 generated ones. A manager per FHIR type would be the same mistake in a new language.

| Manager | Backing today | Framework or application |
|---|---|---|
| __Records__ | `ResourceBase`, `RelatedResource`, `ResourceAssociation`, `ResourceComposition`, `Favorite` | application |
| __Sources__ | `SourceCredential`, `SourceSummary` — connected providers, tokens, sync state | application |
| __Catalog__ | `ProviderCatalogEntry` | application |
| __Glossary__ | `Glossary` — patient-legible term explanations | application |
| __Users__ | `User`, passwords, legal consent | framework |
| __Sessions__ | `AccessToken`, token generation, revocation | framework |
| __Settings__ | `SystemSettingEntry`, `UserSettingEntry` | framework |
| __Jobs__ | `BackgroundJob` | framework |
| __Audit__ | does not exist yet ([#507](https://github.com/jwilleke/yourphr/issues/507)) | framework |
| __Shares__ | does not exist yet ([#524](https://github.com/jwilleke/yourphr/issues/524)) | framework |
| __Backups__ | artifacts, plus the cross-manager coordination noted above | framework |

__This split is itself a test of the framework claim, and it passes in a useful way.__ Everything application-specific is the health-domain part — records, sources, catalog, glossary. Nothing else about a personal health record is architecturally special, which is the outcome the framework goal needs and did not have to produce.

### Judgment calls, recorded as calls

- __Sessions are split from Users.__ Arguably one resource. Split because token generation and revocation have a lifecycle of their own, and [#528](https://github.com/jwilleke/yourphr/issues/528) was precisely that lifecycle failing silently while buried in the user row.
- __Favorites, legal consent and support requests get no door.__ One small table each; a manager apiece is ceremony. Favorites fold into Records, consent into Users, support into nothing yet.
- __Sources and Catalog look like one resource and are not.__ Catalog is what an operator *could* connect to; Sources is what they *did*, holding OAuth credentials. Different lifecycles and very different sensitivity.
- __Glossary may not be a resource at all__ — possibly reference data the display layer reads rather than something needing a door. Listed so the question is answered deliberately rather than by default.

### The trap, now concrete

ngdpbase's `PersonManager` and `OrganizationManager` look like direct hits. They are not. __Patient, Practitioner and Organization are FHIR records living in the record store.__ Giving them managers puts a second door on the same table, which breaks the invariant instead of serving it — the exact failure named earlier: *if two managers own the same table, neither is a chokepoint.*

## What does not transfer

Recording this so the adoption does not become cargo-culting.

| ngdpbase concept | Why not |
|---|---|
| __Page-oriented ACL__ | Its ACL secures *pages*. A PHR secures *resources and compartments*, which is what Medplum's declarative Access Policies are built for. The `PolicyEvaluator` __shape__ transfers; its subject model does not. |
| `PageManager`, `CommentManager`, `FootnoteManager`, `TemplateManager`, `RenderingManager`, `VariableManager` | Wiki domain. No PHR analogue. |
| `src/plugins/` | JSPWiki-style __markup macros__, not application modules. "YourPHR as an ngdpbase plugin" is not an available shape — this was checked. |
| The manager *list* | A count is not a design. YourPHR's managers follow from its own resources, not from matching ngdpbase's roster. (This is about the list, not the granularity — on providers and capabilities the position is now to err __fine__, for the reasons above.) |

## What this means concretely

Against the phases already filed under [#544](https://github.com/jwilleke/yourphr/issues/544):

- __Sync__ ([#539](https://github.com/jwilleke/yourphr/issues/539)) is the Sources manager, with a provider per source type and an inert default — and, because the base contract demands it, an answer for how connected-source state is backed up.
- __Auth__ ([#541](https://github.com/jwilleke/yourphr/issues/541)) is Users plus Sessions, over `BaseAuthProvider`. `PasswordAuthProvider` is all YourPHR needs today; the interface is what lets OIDC or magic link arrive later without rework. The result it returns must carry token generation, or [#528](https://github.com/jwilleke/yourphr/issues/528) recurs in a new language.
- __Audit__ ([#507](https://github.com/jwilleke/yourphr/issues/507)) — ngdpbase already has `Database` / `File` / `Null` audit providers to adopt. It is a __required__ capability, so it must refuse to boot rather than degrade to inert ([#546](https://github.com/jwilleke/yourphr/issues/546)).
- __Backup__ stops being a feature and becomes part of every manager's contract — the only way the encryption/backup exclusion stops being permanent ([#461](https://github.com/jwilleke/yourphr/issues/461)), and the reason a default install currently has no backup at all ([#545](https://github.com/jwilleke/yourphr/issues/545)).
- __The two Go leaks__ named above are worth fixing whether or not any of this happens, since they are second doors to live data today.

## Framework recommendations

> __Status: decided 2026-08-22__, after re-reading this document against `jwilleke/ngdpbase` `src/WikiEngine.ts`, `src/core/Engine.ts`, `src/managers/BaseManager.ts`, `src/context/ApiContext.ts` and the routes that use them. Recorded here so the adoption copies the __pattern__ and not the implementation details that ngdpbase itself has outgrown. Tracked by [#608](https://github.com/jwilleke/yourphr/issues/608).

### The verdict

The shape is sound and well known: managers are application services (one door per resource), providers are adapters (ports and adapters), the engine is the composition root, the context is the request principal. For a PHR the three ideas above are what make audit, authorization, backup and encryption *truthful* rather than decorative, and none of them is fashion.

As an application architecture for one maintainer it is strong — coherent, proven at 101k lines, and already in the maintainer's head, which this document counts as a constraint rather than a preference. As a __reusable framework__ it is not yet proven, and this document already says why: the seams that would prove it (the `resource → scope` resolver, the permission registry contents versus its mechanism, the zero-framework-edits test) have never met a second application. YourPHR is that second application. So the rule stands: copy the pattern into YourPHR first, extract the package second.

### Five mechanisms to tighten while copying

Each of these keeps `Engine` / `BaseManager` / `Base<X>Provider` / `ApiContext` as names and as roles, and changes only how the guarantee is enforced. Every one is visible in ngdpbase today.

| As built in ngdpbase | Weakness | YourPHR does instead |
|---|---|---|
| `engine.getManager<T>('Name')` returns `T \| undefined`; the generic is a cast | A typo is a runtime `undefined`, not a compile error; 423 call sites each trust `!` or branch; dependencies hide inside method bodies (the service-locator criticism) | A __typed registry__: `engine.managers.records`, an interface-keyed map, so a missing manager fails at compile time and a handler's dependencies are visible in its signature |
| Managers registered in hand-written source order; nothing validates the order | A manager reading configuration before it is ready silently takes defaults (line 182 above) | Managers __declare their dependencies__; the engine validates a topological boot order and refuses a cycle |
| ~~`WikiEngine.context` + `setContext()` — a process-global context slot~~ __Removed from ngdpbase ([#1132](https://github.com/jwilleke/ngdpbase/issues/1132))__ | Was: request state on a singleton; the session-scoped trap this document names, one concurrent request from a cross-user leak. It had no callers — the migration to passing the context into manager calls had already happened, and only the slot was left | __No global context__, now true in both codebases. `ApiContext.from(req, engine)` / `RequestContext.from(req, engine)` is created per request and dies with it. Nothing to copy here; do not reintroduce the slot |
| Provider loading is a convention every manager repeats (read key, default, PascalCase, dynamic import); any load error falls back to `Null` | Enforced by everyone remembering; a required capability can go inert at boot ([#546](https://github.com/jwilleke/yourphr/issues/546)) | __One provider factory__ `(capability, config) → instance` with dynamic import; each capability declares __required__ or __optional__; the resolved set is logged at boot; required refuses to boot |
| `UserManager` at 1,600 lines | "One door" read as "one class" — the god-object failure this document already names | One manager per __resource__, the provider behind it does the work; an __interface per manager__ so tests inject a fake without an engine |

Plus the one rule that outlives the document: __the store-boundary lint__ — only `managers/` may import a store or the driver, and nothing outside a manager may dereference `ctx.engine`. Delete the rule, prove CI goes red.

### The context rule, decided (question 1 of the adoption)

Point 2 of the model says the context is passed into managers and managers are not reached through it; line 221 allows the engine on the context; ngdpbase as built reaches managers through the context freely. The resolution:

- The engine/manager registry is taken __as built__: handlers are constructed with the engine and ask it for managers; managers hold the engine and reach siblings through it.
- Point 2 is the __manager-side__ rule: the context is passed __into__ every manager call and says who is asking (subject, role, token generation, request incidentals). A manager never reads `ctx.engine`.
- The context may carry the engine for handler convenience (line 221), and the lint rule above is what stops that convenience from becoming a bypass.
- The global context slot is not copied.

### The remaining adoption questions, decided (2026-08-22)

Seven more questions were asked one at a time and answered; the answers bind [#608](https://github.com/jwilleke/yourphr/issues/608) and its children.

1. __Q2 — Scope and order.__ Managers, engine, context and the store-boundary lint first — behaviour-preserving, every harness and the parity audit unchanged. Config-bound providers and policy-as-data follow as their own issues under #608. One issue per manager, Records first: it is the largest door and where the raw queries concentrate.
2. __Q3 — The tree.__ `src/framework/` and `src/app/` from the start, per the table above; no package extraction yet. The count of framework-file edits is the only evidence the framework claim will ever get, so it is collected from day one.
3. __Q4 — Records.__ The Records manager is the door: it takes the context, owns the per-user repository handles, and its methods are the reconciled and classified views (conditions, allergies, immunizations, medications, the IPS, provenance, recent activity, the typed query). `SqliteFhirRepository` becomes `SqliteRecordsProvider`, the one-active PHI-storage capability. The search index is the provider's internal, so the provider interface exposes __indexed search__ and __grouped aggregation__ as operations, never the table. The 70+ FHIR types stay one resource.
4. __Q5 — Authentication.__ Users and Sessions as two managers over `BaseAuthProvider`, with `PasswordAuthProvider` the only implementation. The `AuthResult` is complete from day one — subject, provider, satisfied factors, issued-at, expiry, __token generation__ — so [#528](https://github.com/jwilleke/yourphr/issues/528) cannot recur. Any-of versus all-of is expressed in the config key names and the interface (`auth.providers` alternatives, `auth.factors` all required), and the bypass test — an all-of list cannot be satisfied by one factor — is written now against a fake second factor so the first real one meets it.
5. __Q6 — Required capabilities__ ([#546](https://github.com/jwilleke/yourphr/issues/546)). Required, refusing to boot: PHI storage, users/sessions storage, audit (an unaudited disclosure did not happen, so the sink must exist before the first request). Optional, inert default, named in one boot-time log line: backup storage (the backup *action* refuses loudly, not the boot), the SMART source client (an instance with no connected sources never loads the URL-fetching path), events, mail, the relay. The log sink is the thing that reports the others — console by default, neither category.
6. __Q7 — The migration tool__ boots an engine without the HTTP server and writes through the managers as a named system principal (`migration`), so every imported row met the index, the audit and the collision check the Records manager owns. The verification gate stays outside the managers: it is a witness, and a witness that reads through the thing it checks proves less.
7. __Q8 — Naming.__ Framework names verbatim from ngdpbase so a reader of one codebase reads the other and extraction renames nothing: `Engine`, `BaseManager`, `Base<Capability>Provider`, `<Impl><Capability>Provider`, `ConfigurationManager`, `ApiContext.from(req, engine)`. Application managers carry plain resource names: `RecordsManager`, `SourcesManager`, `CatalogManager`, `UsersManager`, `SessionsManager`, `SettingsManager`, `JobsManager`, `AuditManager`, `BackupManager`. `ApiContext` rather than `WikiContext`, since this stack renders nothing server-side.

## The honest risk

__Structure is not free__, and managers and providers are justified by different things — conflating the two tests is how this goes wrong in both directions at once.

- __A manager is justified by being the only door to a resource.__ Not by having alternative implementations, and not by symmetry with ngdpbase's list. So the test is: *is this a resource, and would code otherwise reach it directly?* One manager per resource. If two managers own the same table, neither is a chokepoint and the invariant is already gone.
- __A provider is justified by someone plausibly needing to replace it.__ For an application that means a second implementation you would write yourself, which is a narrow test. For a __framework__ the second implementation is the *adopter's*, and the question becomes whether a customiser would otherwise have to fork. That is a much wider licence, and it is the licence the framework goal asks for.

An earlier draft of this document applied the narrow test and concluded "do not adopt the provider count". Three arguments overturned it: the framework goal makes replaceability the adopter's concern rather than ours; finer capabilities are what let an operator separate PHI storage from audit storage at all; and a capability that is never loaded costs nothing, so granularity is close to free. Erring granular is now the position.

What has *not* changed is that a provider interface must have a plausible second implementation by __someone__. A layer nobody will ever swap is still a layer.

The failure mode to watch is not too many managers — it is __too few, each too large__, because "one path to users" was read as "one class for everything about users". `UserManager` at 1,600 lines is the worked example, in the codebase being copied from.

The other failure mode is quieter: the invariant erodes one convenient direct query at a time, and nothing goes red. That is why the lint rule matters more than this document does.
