# Security posture

The decision record for how an ngdpbase instance declares and inspects its security-related settings. How to write a route, manager method or addon that satisfies P1 and P2 is the [security developer guide](security-developer-guide.md).

Where a decision has an operational half — how to configure it, how to verify it, how it fails — that lives beside it and is linked from the decision: transport and TLS are in [platform/ngdpbase-and-TLS.md](./platform/ngdpbase-and-TLS.md).

This file records __decisions and their reasons__. The exploratory design that preceded it lives in [planning/security-profile.md](./planning/security-profile.md); where the two disagree, this file wins and the older document is to be corrected. Tracked by [#1137](https://github.com/jwilleke/ngdpbase/issues/1137).

## Guiding Principles

Standing rules that inform the decisions below rather than being decisions themselves. A decision answers "what did we choose here"; a principle answers "what shape should the next choice take".

### P1 — Every security-relevant call carries a context

__Any entry point that makes an authorization decision, writes an audit record, or acts on someone's behalf takes a context — mandatory and positional. Below that line, pure computation takes data.__

__Why the line is drawn there.__ Every permission and attribution defect found on 2026-09-02 traced to the same shape: a call that could not carry provenance, so provenance was lost.

| Where | The call | What was lost |
| --- | --- | --- |
| [#1164](https://github.com/jwilleke/ngdpbase/issues/1164) | `hasPermission(username: string, …)` | the parameter had nowhere to put `viaToken`, so the agent-token scope ceiling was __structurally unable to run__ — 17 route sites |
| [#1173](https://github.com/jwilleke/ngdpbase/issues/1173) | `ApiContext.from()`, `ParseContext` | both rebuilt a three-field subject and dropped `viaToken`, so every addon API route using `ctx.requirePermission()` bypassed the ceiling |
| [#631](https://github.com/jwilleke/ngdpbase/issues/631) | `enqueue(jobId)` | no actor at all — `WikiRoutes` logged `Page reindex requested by: jim` on one line and threw the name away on the next |

One cause, three surfaces, found three different ways. __A parameter that cannot carry provenance guarantees provenance is lost__, and no amount of care at call sites repairs that: #1164 was reported as twelve sites, the compiler found seventeen, and `AttachmentManager` bypassed the ceiling while passing an object.

This is the two-code-paths rule from [planning/Security-auditing.md](./planning/Security-auditing.md) in its general form — *"a flag that gates a mechanism creates two code paths, and the weak one is what everybody runs."* An optional actor parameter is that flag, and the weak path is the one where it is omitted.

__Mandatory and positional, not an optional `opts` bag.__ Optional is what makes omission the easy path, and a default actor is a decision made by nobody. Note the specific hazard: a permissive system principal — `roles: ['system', 'All']` — introduced to satisfy a mandatory parameter would be a new bypass of exactly the kind this principle exists to prevent, holding rights no token could be minted with and passing the ceiling cleanly because it carries no `viaToken`. `jobContextFromSystem(reason)` resists that by requiring a stated reason rather than supplying a role. What [#631](https://github.com/jwilleke/ngdpbase/issues/631) settled (operator, 2026-09-03) splits the two halves of that hazard: __identity__ is a name the environment owns (`NGDPBASE_SYSTEM_USER`, refused at boot when unset, reserved in the user store so no person can hold it), and __authority__ is `ngdpbase.system.roles` — `admin` as shipped — resolved through policy at the moment of each decision, never carried in a context. The hazard was never the word in a roles array; it was a principal nobody named and a grant that rode along where a caller could widen it. See [bootstrap-methodology.md](./bootstrap-methodology.md#the-system-principal).

__Why the rule is scoped rather than universal.__ "Every call" would include pure computation — a formatter, a record builder, a path normalizer — where the context is a parameter nothing reads. A parameter nothing reads is one that gets passed `null` or a placeholder, and once it is routinely fake the word "mandatory" stops carrying information and reviewers stop looking at it. The rule would then have recreated the two-code-paths problem inside its own fix. Scoping it to calls that decide, record, or act keeps every site meaningful.

__Forward the context you were given; never rebuild one from its fields.__ A reconstructed `{ username, roles, isAuthenticated }` type-checks perfectly and silently carries no token — the #1173 defect. `scripts/check-permission-subject.ts` rejects inline subject literals for that reason, and per the scoping lesson in [#1177](https://github.com/jwilleke/ngdpbase/issues/1177) it is scoped to where the property must hold rather than to where the last bug was found.

__Identity and provenance travel; authority does not.__ A context carries who acted and from what origin. It does not carry resolved roles, because a job enqueued at 09:00 and running at 09:12 must not authorise against 09:00's roles. Same reasoning `app.ts` gives for agent tokens: roles are resolved live per request, and a token never carries a snapshot.

__The one exception is a lookup, and it has its own name.__ Asking "does this named user hold this permission?" involves no request and no token to drop. That is `UserManager.userHoldsPermission(username, action)` — deliberately distinct from `hasPermission`, so route code cannot reach it by accident.

__What this rules out.__ Ambient propagation — a process-global request slot, or `AsyncLocalStorage`. The global form was removed as dead surface in [#1132](https://github.com/jwilleke/ngdpbase/issues/1132). `AsyncLocalStorage` is a sounder implementation of the same idea and is still refused here, because it shares the property that made the global wrong: the call site does not show what identity it runs under, so a missing context is invisible at review rather than a compile error. Threading costs more churn and is worth it.

Tracked by [#1179](https://github.com/jwilleke/ngdpbase/issues/1179).

### P2 — Allow and deny are permissions, not authentication or roles

__The only allow/deny for a request is `hasPermission` (capability) or `canAccess` (this page). `isAuthenticated` classifies the failure. `hasRole` is a membership lookup about a named user, never authority of this context.__

P1 says identity and provenance travel and authority does not: a context carries who acted and from what origin; it does not carry a snapshot of roles, and a token never does. This principle is that half applied to the door. If the door reads `isAuthenticated` or `hasRole`, the ceiling P1 exists to carry has nothing to enforce.

__A role on the delegator is not authority of the delegate.__ A token (or any other delegated credential) is not the user. It is a slice of permission the user handed to something else. The owner can still hold `admin`; this request only holds `page-read`. `hasRole('admin')` on that request answers a question about the person, not about this acting credential. `hasPermission` already refuses scopes the token does not have (`UserManager.ts`, the `viaToken.scopes` ceiling). `hasRole` never looks at `viaToken` — it reads `userContext.roles`, which are the owner's. That is the ceiling in reverse.

Display is the same defect. Showing an Admin link because the owner has the role, on a request that only has `page-read`, authorizes the UI from the wrong principal.

| Check | What it answers | Valid as allow/deny? |
| --- | --- | --- |
| `isAuthenticated` | A session exists | No. Identity is not authority. [#1178](https://github.com/jwilleke/ngdpbase/issues/1178): a `page-read` token is authenticated and could mint `page-delete`. Honest use: 401 vs 403, and login vs register chrome. |
| `hasRole('admin')` | The named user carries that string | No, for this request. Roles are membership, resolved live. A role check skips PolicyEvaluator, deny policies, and the token ceiling. Honest use: `UserManager.hasRole(username, role)` as a lookup about somebody else, the same shape as `userHoldsPermission`. |
| `hasPermission('admin-system')` | May this principal do this action, now | Yes. Policies, inactive users, `All` / `Authenticated` expansion, and the token ceiling meet here. |
| `canAccess('edit')` | May they do it on this page | Yes. Same door, plus ACL / audience. |

Anonymous access is a permission too (`page-read` held by `anonymous` / `All`), not “skip the check because nobody is logged in.”

__What this rules out.__ `requireAuthenticated()` or `if (!currentUser.isAuthenticated)` as the allow. `hasRole('admin')` / `requireRole('admin')` as a route or plugin gate, including “cheap” chrome. `WikiContext.userHasRole` on a request that carries `viaToken`. Any path that would have been `hasRole('admin')` and is now a mutation — those are already being moved to a permission ([#1034](https://github.com/jwilleke/ngdpbase/issues/1034)) because a role name is invisible to the evaluator and to the ceiling.

This is the direction, and since 2026-09-04 the state of `src/routes`: no route in `WikiRoutes.ts` decides allow or deny by role name, and a static test holds it there. The first two gates removed under this principle were `AttachmentManager.checkPermission` and `UserManager.requirePermissions` (2026-09-03, with [#631](https://github.com/jwilleke/ngdpbase/issues/631)'s system principal, which the attachment gate had been refusing before policy was asked). Still standing: the role-name gates in addon routes and in a few plugins and services, and the `isAuthenticated` pre-checks that run ahead of policy.

Since 2026-09-05 the state of `src/` is: no role-name gate outside the evaluator and the named-user lookups (`src/__tests__/roleNameGates.test.ts` holds it), and no `isAuthenticated` allow in `WikiRoutes.ts` — every former one asks a permission through `permitted()`, and `refuse()` is the one place the flag is read, to choose 401 / a login redirect over 403 (`WikiRoutes.permissionGates.test.ts` holds it). Three permissions were added for the routes that named none: `profile-manage` and `comment-create` on one `Authenticated` policy, and `token-mint` for editors and admins, which a token can never carry as a scope. The picker's people search ([#694](https://github.com/jwilleke/ngdpbase/issues/694)) asks `search-user`, granted on the same `Authenticated` policy, so no session-flag scope choice remains.

Tracked by [#1198](https://github.com/jwilleke/ngdpbase/issues/1198), which carries the count of gates still standing.

## Decisions

### D1 — "Security posture" is the official term

The set of security-related settings an instance is running is its __security posture__. That is the name used in documentation, the admin UI, issues and commit messages.

Consequence to resolve: `AuditManager.getAuditPosture()` already uses the word for what auditing currently *does* (provider, degraded, reason). That usage is compatible — it reports actual state, which is what a posture is under D2 — but the naming should be reconciled when [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) generalises it. The operational inventory of those capabilities is [audit-posture.md](./audit-posture.md).

__Issues:__ [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) __landed 2026-09-01__ as recommendation content. No general report was built: D2 and [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) satisfy rule 3 structurally, so the name D21 rejected never needed a replacement.

### D2 — There is one posture: the active one

An instance has __one security posture__, and it is the settings it is actually running. There is no catalogue of selectable posture objects and no preset layer.

`baseline`, `hardened` and `regulated` are __documented recommendations__ — value sets this project publishes as advice for a deployment shape. They are prose and tables, not configuration objects. An operator reads the one matching their situation and is accountable for setting their instance to their own requirements.

The comparison is against the last booted security posture to detect and audit changes to the security-posture.

This is a deliberate reversal of the preset model in the planning document, and the simpler thing is the better thing here:

- A preset that supplies values invisibly is a second source of truth for every key it touches. The settings are then partly explicit and partly implied by a label, and telling which is which requires knowing the preset.
- Naming a posture is a claim. `profile: "hardened"` asserts a property of the deployment that the label itself cannot establish — the same objection that rules out `hipaa` and `pci` as values, applied one level up.
- Accountability lands where it belongs. The instance does not assert a posture on the operator's behalf; it shows them what they are running.

Rule 3 of the planning document — *the instance publishes what it demonstrates, not the label it selected* — is satisfied structurally under D2 rather than needing a mechanism, because there is no label. What the operator sees is the settings themselves.

__Issues:__ Tracked by [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) — __landed 2026-09-01__. `ngdpbase.security.profile` is gone from the shipped config and has no consumers left.

### D3 — The posture is a view over security-related settings

The posture is a __curated set of existing configuration keys__, surfaced together because they determine the instance's security properties:

```json
"ngdpbase.session.secure": false
```

Each item is an ordinary key with its own shipped default, read by live code. The posture adds no resolution step and changes no value on its own — it decides which settings are presented as one subject, and shows what each is currently set to.

An item is always a key that already exists. This is what makes rule 5 of the planning document — *never declare a control whose mechanism does not exist* — a check rather than an aspiration: every item must name a key present in `config/app-default-config.json`, verifiable at boot instead of by review.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D4 — Items are addable and removable

The set is not fixed. An operator adds a key to their posture or removes one, so the view reflects what they consider security-relevant for their deployment.

Removing an item removes it from the __view__, never from the configuration. The key keeps whatever value it has; it simply stops being presented as part of the posture. This is the reason removal is safe here and would not have been under a preset model, where dropping an item silently changed the effective value.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D5 — The posture is edited in the admin dashboard

A collapsible __Security Posture__ section on the admin dashboard lists the active posture's items with their current values, and lets an operator add or remove items.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D6 — Restart requirements are per item, and the UI must say so

Changing a posture item does not uniformly require a restart. `ConfigurationManager.setProperty()` writes to both the merged config and `app-custom-config.json` immediately, so a subsequent `getProperty` sees the new value at once — but whether that reaches the running behaviour depends on when the consumer reads it.

Both kinds exist among the settings a posture would cover:

| Setting | Read at | Effect of a change |
|---|---|---|
| `ngdpbase.application.registration` | per request, inside the auth providers | live |
| `ngdpbase.session.secure` | boot — `app.ts:467`, when the session middleware is constructed | needs a restart |
| `ngdpbase.audit.on-failure` | boot — `AuditManager.loadProvider()` | needs a restart |
| `ngdpbase.security.egress.*` | boot — `resolveEgressPolicy()` at `app.ts:298` | needs a restart |

So the honest answer is neither "yes" nor "no": a posture is a mix, and an operator who changes `session.secure` and sees the dashboard report the new value has been told something untrue until they restart.

__The ingredient declares whether it needs a restart.__ The posture entry carries a `restart` flag beside its `group` (D16), and the section marks those items when their value is changed.

The TLS keys are the same shape and are read at boot for the same reason — see [platform/ngdpbase-and-TLS.md](./platform/ngdpbase-and-TLS.md) for the transport side of this.

A comparison between the running process and the configuration was considered and rejected as over-built. It needs either a boot snapshot, which reports a false restart-pending for the ingredients whose consumers re-read live — `LoginThrottle.ts:73` and `SimpleRateLimiter.ts:47` both replace their options at runtime for exactly that reason — or every consumer publishing the value it applied, which is instrumentation in every subsystem to produce a flag that a maintainer can simply write down. If a consumer later changes when it reads, the flag is updated in the same commit.

This is the same failure shape as [#1147](https://github.com/jwilleke/ngdpbase/issues/1147), where the maintenance-mode toggle and the config key disagree about what is in force. A posture view whose values do not match the running system would be that bug with a wider blast radius, so the per-item marking is not polish — it is the feature working.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D7 — `ngdpbase.security.profile` is removed

With one active posture (D2) there is nothing for a profile value to select, so `baseline` and `hardened` are meaningless __as configuration values__ and the key goes.

The words are not meaningless — they remain the names of the recommended value sets in D2. What disappears is the key whose value chose between them, and the idea that an instance declares one.

It is not renamed either. `ngdpbase.security.posture` (D15, D16) is a different key of a different type doing a different job — an object naming the active posture's ingredients, not a string selecting a preset. Reading it as a rename would carry the preset idea forward under a new name, which is exactly what D2 removed.

Its two consumers, recorded below, are handled differently because only one of them was a preset:

- __The auditing default and its divergence warning are deleted__ (`AuditManager.ts:364-382`). `ngdpbase.audit.on-failure` keeps its shipped `continue` and is set explicitly by an operator who wants `refuse-boot`. Nothing is lost: as recorded below, the preset half was already unreachable in a stock install, and an operator who had set the key explicitly keeps exactly the value they set.
- __The egress conflict behaviour is not a preset and is re-homed, not deleted.__ It decided whether a contradictory CIDR configuration stops the boot. D8 answers it: nothing stops the boot, because the firewall convention resolves every case except a malformed range, which D9 handles.

__Issues:__ Tracked by [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) — __landed 2026-09-01__. Its second consumer, [#1133](https://github.com/jwilleke/ngdpbase/issues/1133)'s egress reconciliation, was re-homed rather than deleted — see D8.

### D8 — Egress conflicts resolve by firewall convention, and none of them is fatal

[#1133](https://github.com/jwilleke/ngdpbase/issues/1133) already chose the convention: overlaps resolve by __longest prefix match__ — the routing rule, because the values are routes — with explicit entries beating built-in defaults at equal length. General overlaps are therefore not conflicts and `reconcilePolicy()` does not flag them.

The three cases it does flag are the ones longest prefix cannot decide, and two of them have standard answers rather than needing an operator:

| Case | Resolution |
|---|---|
| An allow entry intersects the mechanism (loopback, link-local, multicast, Teredo) | Unsatisfiable at any prefix length — the mechanism is absolute. Drop the entry, log it. |
| A range appears verbatim in both lists | A prefix-length tie. __Deny wins__, the default-deny bias every firewall applies. Log it. |
| A range does not parse as CIDR | No prefix to compare. See D9. |

The tie break was a behaviour __change__, not just a re-homing. Previously a range in both lists was dropped from __both__, so the operator's stricter statement was discarded along with the looser one and the range fell back to the built-in defaults. Now the deny survives.

__No case refuses to start the instance.__ That was the profile looking for a job, and it is not the convention: `iptables` rejects a bad rule and keeps the chain, and the Kubernetes API server rejects an invalid NetworkPolicy while the other policies keep applying. Neither takes the workload down.

__Issues:__ Tracked by [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) — __landed 2026-09-01__; the behaviour re-homed came from [#1133](https://github.com/jwilleke/ngdpbase/issues/1133). The malformed-CIDR case it defers to D9 is [#1152](https://github.com/jwilleke/ngdpbase/issues/1152), which is now the only thing standing between a malformed deny rule and it silently not applying.

What an empty list does, and when to set a value, is [Allowed ranges](#allowed-ranges).

### Allowed ranges

Operational half of D8 and [#1133](https://github.com/jwilleke/ngdpbase/issues/1133). `ngdpbase.security.egress.allowed-ranges` is a CIDR list, not a URL list. Empty is the shipped default, and it is the right setting for an instance that only fetches the public internet.

With `allowed-ranges: []` (what ships):

| Destination | Result |
| --- | --- |
| Public internet (`https://example.com`, a public feed, a CDN) | Allowed |
| RFC1918 / CGNAT / IPv6 unique-local (`10/8`, `192.168/16`, `fd00::/8`, …) | Refused |
| Loopback, link-local (incl. `169.254.169.254`), multicast, Teredo | Always refused — an allow entry cannot open these |

Set the key only when this process must reach __private infrastructure__: a LAN sist2, an internal Elasticsearch, a NAS. Then put the __narrowest prefix that is actually needed__, not `0.0.0.0/0` and not all of `10.0.0.0/8`.

A home instance on `192.168.68.0/24` that must reach sist2 or Elasticsearch on that segment:

```json
"ngdpbase.security.egress.allowed-ranges": ["192.168.68.0/24"]
```

That is the example the config comment already uses. It belongs in __this instance's__ custom config, not in shipped `app-default-config.json`. It lets this process fetch `http://192.168.68.71:4090` and `:9200`. It still refuses `localhost` / `127.0.0.1`, link-local, and every other private range.

Bounds:

- `/24` opens the whole segment, not only `.71`. If nothing else on that LAN should be reachable from the app, `192.168.68.71/32` is tighter.
- The key is `restart: true` — change it, then `./server.sh restart`.
- IPv6 unique-local is still denied unless you add that prefix too.
- Do not set a dummy or overly broad list “to have a value.” That weakens the default-deny.
- Do not set it hoping to allow `http://localhost:…` — that hostname and address are mechanism, not policy ([#1186](https://github.com/jwilleke/ngdpbase/issues/1186)).

### D9 — A fatal configuration entry boots into maintenance mode, not a dead process

A malformed CIDR is the one case with no safe silent resolution. Dropping a malformed __allow__ entry fails closed and is harmless. Dropping a malformed __deny__ entry fails __open__: the operator wrote a restriction, it silently did not apply, and nothing looks wrong.

So it must stop the instance from serving — but *refusing to boot* is the wrong way to stop it, because it leaves the operator hand-editing JSON on disk, which is the worst place to repair a security setting.

Instead the instance __boots into maintenance mode__, shows a notice naming the fatal entry, and links to the admin screen that fixes it. Non-admin traffic gets the maintenance page; the operator gets in and repairs the value. The egress boundary is still enforced throughout, from the built-in defaults and whichever entries did parse, so the degraded state is not an exposed one.

Two defences, in order:

1. __The admin UI validates on save.__ Malformed CIDRs and verbatim duplicates are caught at the point of entry and never reach the configuration. This is the path that matters, because it is how an operator normally edits.
2. __The boot check is the backstop__ for a hand-edited `app-custom-config.json`, which is the only remaining way in.

What this requires, established from the code rather than assumed:

- __`app.ts:317` currently calls `process.exit(1)`__ when engine initialisation throws, and the egress fatal path throws. Routes, the admin screens and the maintenance middleware are all registered *after* that block, so today nothing survives to serve a notice. A fatal *configuration entry* has to be distinguished from an engine crash and must not throw.
- __The initialisation gate at `app.ts:253` is the wrong mechanism__ — its bypass list has no `/admin` or `/login`, so it locks out the very person who would fix the problem. The admin maintenance middleware at `app.ts:713` already has the right shape: it passes `/admin`, `/login` and `/logout` through and serves everyone else the maintenance page.
- __This depends on [#1147](https://github.com/jwilleke/ngdpbase/issues/1147).__ Maintenance mode currently has two sources of truth and its toggle does not survive a restart. Adding a third trigger to a mechanism with an open P1 defect would build on the defect, so #1147 lands first.

__Issues:__ Tracked by [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) — __landed 2026-09-01__, on top of [#1147](https://github.com/jwilleke/ngdpbase/issues/1147).

### D10 — Startup failures are gated into survivable and fatal

`app.ts:317` currently treats every initialisation failure the same way: `process.exit(1)`. A mistyped CIDR and an unreadable data directory produce the identical outcome, which is a process that is gone and an operator with no route back except the filesystem. A gate replaces it.

__The test: can an administrator repair this through the admin UI?__

- __Survivable__ — the instance boots into maintenance mode, states what is wrong, and links to the screen that fixes it. Non-admin traffic gets the maintenance page. This covers bad configuration *values*: a malformed CIDR (D9), an out-of-range number, an unusable provider selection.
- __Fatal__ — `process.exit(1)`, because the machinery needed to serve the repair UI is itself unavailable. That means `ConfigurationManager` (there is nothing to read or write), or the user and session layer (nobody can authenticate to perform the repair), or the data directory being unreadable.

The distinction is not severity. A malformed deny rule is serious — D9 keeps the instance from serving because of it. The distinction is __whether stopping the process helps__, and it only helps when the process cannot offer a way out.

__Most of this already exists.__ `app.listen()` runs at `app.ts:279`, *before* engine initialisation, and the gate at `app.ts:253` serves the maintenance page while `engineReady` is false. A serving-but-not-ready instance is already the architecture; `process.exit(1)` discards it. What is missing is a survivable-failure state that keeps the process alive, and an `/admin` and `/login` bypass on that gate so the repair path is reachable — the admin maintenance middleware at `app.ts:713` already has the bypass shape to copy.

__Issues:__ Tracked by [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) — __landed 2026-09-01__.

### D11 — `audit.on-failure: refuse-boot` folds into the survivable path

An audit provider that is configured and cannot be used is the same shape as a malformed CIDR: an operator's mistake, repairable through the admin UI. It takes the D10 survivable path.

The guarantee is unchanged — an instance whose auditing is broken serves nobody — but it is delivered by maintenance mode instead of by a dead process, so the provider can be fixed without filesystem access. `AuditManager.loadProvider()` stops throwing into the fatal catch and raises a survivable configuration failure instead.

__The value name was reviewed and kept__ — see D14. `engineReady = false` means the boot did not complete, so `refuse-boot` still describes what happens.

__Orchestration is preserved by readiness, not by exiting.__ The concern with folding this in was that an operator setting `refuse-boot` may mean *the process must not exist*, as a signal to a supervisor. The health split at `app.ts:209` and `app.ts:221` already answers that: liveness deliberately checks nothing and reports a wedged process only, while readiness returns 503 to pull an instance out of rotation without terminating it. A configuration-blocked instance reports not-ready, and an orchestrator withholds traffic exactly as it would from a dead one.

It is also strictly better than exiting under a supervisor. A process that exits on a bad config value restarts, fails identically, and restarts again — `CrashLoopBackOff` under Kubernetes, an endless respawn under pm2 — and the operator never gets a running instance to repair it with. Nothing about that loop reaches the admin UI.

__Issues:__ Tracked by [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) — __landed 2026-09-01__.

### D12 — Configuration-blocked is `engineReady = false`

A survivable configuration failure sets `engineReady` to false, which puts the instance into maintenance mode through the gate that already exists at `app.ts:253`. No new serving mechanism is invented, and the instance reports not-ready.

This works with the current control flow: `engineReady = true` is set at `app.ts:806`, at the very end of setup and *after* routes are registered. So an instance can have its admin routes mounted while the flag is still false — which is what makes a repair path possible at all.

Two changes are required, and without them this state locks the operator out rather than letting them in:

- __The gate must distinguish why it is not ready.__ Its bypass list (`app.ts:255-260`) covers static assets only — no `/admin`, no `/login`. That is correct while the engine is genuinely still initialising, because the managers behind those screens are not up yet; it is wrong when the engine finished and a configuration *value* is the problem, because then the screens work and the operator needs them. The flag therefore carries a reason: __starting__ blocks everything as it does today, __configuration-blocked__ passes `/admin`, `/login` and `/logout` the way the admin maintenance middleware at `app.ts:713` already does.
- __Readiness must learn about it.__ `/health/readiness` (`app.ts:221`) does not read `engineReady`; it reads `engineRef` and then checks the page provider and data directory. `engineRef` is assigned at `app.ts:290`, immediately after `initialize()` returns, so a configuration-blocked instance would otherwise pass every check and report ready while serving nobody. The blocked state has to fail readiness explicitly.

__Why not-ready is right on its own terms.__ Readiness answers "can this instance serve traffic". A configuration-blocked instance cannot, so reporting ready would be a false statement about the running system — the same defect class as [#1079](https://github.com/jwilleke/ngdpbase/issues/1079), where an instance that redirected everything read as healthy. The signal describes reality; that is the whole reason it exists.

The repair UI is served by the instance at its own address, which is all ngdpbase controls. Whatever sits in front of it decides what it routes there, and that is the deployment's business — see D13.

__Issues:__ Tracked by [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) — __landed 2026-09-01__. Depends on [#1147](https://github.com/jwilleke/ngdpbase/issues/1147) — __landed 2026-09-01__.

### D13 — Deployment methodology does not influence the design

The design is decided on its own merits. How an instance happens to be deployed is not an input to it.

ngdpbase accommodates __bare-metal__ and __Docker container__ deployments. It does not shape a behaviour around what a particular orchestrator, proxy or load balancer does with the result — the instance reports what is true about itself and serves what it is asked for at its own address, and infrastructure in front of it is that deployment's concern.

This rule was written because the reasoning above had already broken it: D12's choice of not-ready was being argued from what a Kubernetes Service does with an unready pod, which is an argument about someone's cluster rather than about ngdpbase. The correct justification is that a blocked instance cannot serve, so reporting ready would be untrue. That holds identically on bare metal, in Docker, and anywhere else.

The corollary is that a deployment-specific limitation is not a reason to weaken a correct behaviour. If a topology cannot reach an instance that is honestly reporting not-ready, that is solved in that topology's own configuration, not by making the instance lie.

The live consequence: an instance either terminates TLS itself or sits behind something that does, and __no key names which__. It cannot — nothing on the machine can verify what sits in front of it. Both shapes, and what changes between them, are in [platform/ngdpbase-and-TLS.md](./platform/ngdpbase-and-TLS.md).

__Issues:__ A standing design rule rather than a unit of work. No issue.

### D14 — `refuse-boot` keeps its name

`ngdpbase.audit.on-failure` keeps `continue` and `refuse-boot` as its values. No rename.

The name is still accurate under D12. `engineReady = false` means the boot did not complete — the instance refuses to finish booting and serves the maintenance page instead. The process staying alive to say so is not the boot succeeding; it is the boot being refused in a way that leaves a route to the fix. `refuse-boot` describes that.

Two pieces of __wording__ do become wrong when D11 lands, and they are the thing to correct rather than the value:

- `views/admin-dashboard.ejs:31` tells the operator to set `refuse-boot` "to make this fatal instead". Under D11 it is not fatal, it is blocking.
- `config/app-default-config.json:338` says `refuse-boot` "names the provider and the cause and refuses to start". It still names both, and it does refuse to start serving, but "refuses to start" reads as the process exiting.

__Issues:__ Settled here. The two wording corrections it names __landed 2026-09-01__ with [#1157](https://github.com/jwilleke/ngdpbase/issues/1157): the dashboard now says setting `refuse-boot` stops the instance serving and that it stays running to be repaired, and the config comment says it is blocking, not fatal. `postureDocsConsistency.test.ts` holds both, so the old wording cannot come back unnoticed.

### D15 — The ingredients of the shipped posture

`ngdpbase.security.profile` becomes `ngdpbase.security.posture`, a JSON object holding the ingredients of the active posture.

A pattern match over `config/app-default-config.json` for security-shaped names returns 86 keys, which is the wrong list — most are plumbing, and a few must never be displayed at all. Two exclusion rules cut it down:

- __Never an ingredient: anything in `ngdpbase.config.secret-keys`__ — `session.secret`, `user.security.passwordsalt`, `user.security.defaultpassword`, `addons.demo.admin-account.password`, `mail.provider.smtp.pass`, `auth.google-oidc.client-secret`, `dawarichCompat.apiKey`. A collapsible section that renders these is a disclosure, not a report. `src/utils/redactSecrets.ts` already exists for exactly this and the view reuses it. `session.secret` is additionally a __boot precondition__ ([#1194](https://github.com/jwilleke/ngdpbase/issues/1194)): `src/bootstrap-env.ts` guarantees `NGDPBASE_SESSION_SECRET` is set — generating and backfilling `<FAST_STORAGE>/.env` when it is not — or refuses to start, so the posture can state that the secret is set without ever rendering it, and the shipped literal is never what signs a cookie.
- __Never an ingredient: plumbing and integration wiring__ — directories, filenames, queue sizes, flush intervals, callback URLs, client IDs, team domains. They change how a subsystem runs, not what the instance guarantees.

What remains, grouped as the admin section would group them:

| Group | Ingredients |
|---|---|
| Egress boundary | `security.egress.allowed-ranges`, `security.egress.denied-ranges` |
| Session and cookie | `session.secure`, `session.http-only`, `session.max-age`, `server.trust-proxy` |
| Identity and registration | `auth.password.enabled`, `auth.required-factors`, `application.registration`, `application.registration.password`, `auth.user.default-external`, `auth.magic-link.auto-provision`, `auth.magic-link.ttl-minutes`, `auth.google-oidc.auto-provision` |
| Login throttling | `auth.throttle.enabled`, `.max-attempts`, `.window-minutes`, `.lock-minutes`, `.max-lock-minutes` |
| Agent tokens | `auth.agent-token.enabled`, `.max-per-user`, `.max-ttl-hours`, `.default-ttl-hours`, `.retention-days` |
| Audit | `audit.enabled`, `audit.provider`, `audit.on-failure`, `audit.events`, `audit.retentiondays` |
| Content sanitisation | `filters.security.enabled`, `.prevent-xss`, `.prevent-csrf`, `.sanitize-html`, `.strip-dangerous-content`, `.block-on-save`, `.allowed-tags`, `.allowed-attributes`, `style.security.allow-inline-css`, `style.security.allowed-properties` |
| Rate limiting | `mail.rate-limit.enabled`, `.max-submissions`, `.window-minutes` |

`server.trust-proxy` is in the session group deliberately: `resolveSessionSecurity()` reads the two together, and `app.ts:398` already warns when `session.secure` is on while `trust-proxy` is explicitly false. An ingredient list that showed one without the other would hide half of a known interaction. The full interaction — including why `trust-proxy` should be __unset__ on an instance that terminates its own TLS, and why the warning is suppressed there — is in [platform/ngdpbase-and-TLS.md](./platform/ngdpbase-and-TLS.md).

Two things this survey turned up that the view will make visible, and both are the point of having it:

- __`ngdpbase.filters.security.enabled` ships `false`__ (`SecurityFilter.ts:177`, where it sets `renderFiltering`), while every sub-flag beneath it — `prevent-xss`, `sanitize-html`, `strip-dangerous-content` — ships `true`. Rendered as a list, that reads as a row of controls switched on underneath a master switch that is off.
- __`auth.required-factors` ships `["password"]`__, which is where the absence of MFA ([#421](https://github.com/jwilleke/ngdpbase/issues/421), [#448](https://github.com/jwilleke/ngdpbase/issues/448)) becomes a visible fact rather than a gap somebody has to know about.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__. Two of the ingredients it surveys have their own issues: MFA's absence is [#421](https://github.com/jwilleke/ngdpbase/issues/421) and [#448](https://github.com/jwilleke/ngdpbase/issues/448).

### D16 — The posture object names its ingredients; values stay where they are

`ngdpbase.security.posture` lists __which keys__ are in the active posture. Each ingredient's value continues to live at its own flat key, where the code already reads it.

Nothing about resolution changes. `getProperty('ngdpbase.session.secure')` is untouched, every existing call site keeps working, and no key moves out of the flat catalogue. The object is a curated index; the admin section renders it by reading each named key. This is D3 — the posture is a view — expressed as configuration.

It is also the version that cannot go wrong quietly. Holding the values inside the object would make it a second place a setting can be defined, and the failure mode of two sources of truth for a security setting is the whole reason [#1147](https://github.com/jwilleke/ngdpbase/issues/1147) exists.

__Shape: a map keyed by the ingredient, not a list.__ The obvious encoding — groups holding arrays of key names — breaks D4. `mergeArrays()` replaces a plain string array wholesale, so an operator adding one ingredient to a group would have to restate every other member of it or silently drop them. A map merges per entry:

```json
"ngdpbase.security.posture": {
  "ngdpbase.session.secure":       { "group": "Session and cookie" },
  "ngdpbase.server.trust-proxy":   { "group": "Session and cookie" },
  "ngdpbase.audit.on-failure":     { "group": "Audit" }
}
```

Adding an ingredient is one new entry in `app-custom-config.json`. Removing one is an entry set to `null`, which `deepMergeConfigs()` already honours as an explicit override (`ConfigurationManager.ts:552`) and which the posture reads as "not in this view".

__Removal is safe here in a way it would not have been under a preset.__ Removing an ingredient changes no value and no behaviour — the key keeps whatever it is set to, and the code keeps reading it. It only stops being displayed. That is why D4 can offer removal at all.

The group label travels with the ingredient rather than being hardcoded in the template, so the admin section's sections come from configuration and a new ingredient can arrive without a view change.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D17 — The recommendations ship as required pages, carrying an accountability disclaimer

The `baseline`, `hardened` and `regulated` value sets are published as __required pages__ — content rendered inside the running instance — not as a file in `docs/`.

That puts them where they are used. An operator deciding what their deployment needs is reading their own instance, one click from the admin section that edits the posture (D5); a markdown file in the repository is somewhere they may never look. It also means the recommendations travel with the product rather than with the source.

__Every page carries a prominent disclaimer that the operator alone is accountable and responsible for their configuration decisions.__ This is not boilerplate — it is D2 made visible in the product. The whole reason presets were rejected is that software asserting a security posture on an operator's behalf misplaces the accountability, and a page headed "hardened" would quietly reintroduce exactly that if it read as an instruction rather than as advice. The recommendations describe what a deployment shape typically needs; the operator decides what theirs needs, and owns the outcome.

These are pages rendered by ngdpbase, so the content rules in `CLAUDE.md` apply without exception:

- The word "wiki" appears nowhere; the application is named with `[{$applicationname}]`.
- Links between the pages use the page-linking syntax (`[Page Title]`), never a constructed `/view/` URL.
- Anything the configuration system can supply is pulled in rather than hardcoded.
- Each file follows the existing shape: a UUID filename, and frontmatter carrying `title`, `uuid`, `system-category`, `user-keywords`, `slug`, `lastModified` and `author`.

An operator comparing the three needs them side by side, so the natural form is one page presenting all three with a table of the differences, rather than three pages an operator has to hold in their head at once.

__Issues:__ Tracked by [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) — __landed 2026-09-01__ as the Security Posture Recommendations required page.

### D18 — The Security Posture section requires `admin-system`, to view as well as to edit

Both halves take `admin-system`. Nothing less renders the section.

This departs from the usual admin-screen pattern deliberately. Most screens gate viewing on `hasAdminViewAccess()` — `admin-read` OR `admin-system` (`WikiRoutes.ts:7624`) — and reserve `admin-system` for changes. The posture view is treated instead like the carve-outs at `getActiveSessionDetails()` and the admin user list, which require `user-read` rather than `admin-read` because of what they disclose.

__What it discloses is the reason.__ The section is a map of the instance's defences: egress ranges, throttle thresholds, session flags, whether sanitisation is on, audit retention. A reader who can see `auth.throttle.max-attempts` and `lock-minutes` knows how to pace a password-guessing attempt without tripping the lock, and `filters.security.enabled` tells them whether render-time sanitisation is running at all. That is not a read-only view of administration; it is operational intelligence about the instance.

The concrete case this closes: the `demo-admin` role holds `admin-read` and exists so a public demo instance can expose every admin screen to visitors. Under the usual pattern it would publish the instance's security configuration to anonymous users. Under D18 it does not see the section at all.

No new permission is introduced — `admin-system` already exists and already means system administration, so the permission catalogue in `config/app-default-config.json` is untouched.

__A non-administrator asks for a report.__ Anyone with a legitimate need to know what the instance guarantees is served by the effective-posture report ([#1146](https://github.com/jwilleke/ngdpbase/issues/1146)), which is a different artefact with a different audience: it states what the instance demonstrates rather than listing the settings that produce it. Whether that report is exposed to non-administrators, and under what gate, is deliberately left to that issue.

__Issues:__ Tracked by [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) — __landed 2026-09-01__.

### D19 — Changing the posture is an audited event

Every change to `ngdpbase.security.posture` or to any ingredient's value is recorded in the audit log: what changed, from what to what, by whom.

This is not covered today. `src/utils/auditRegistry.ts` marks `admin-system` as `exempt: 'not-implemented'`, with the note that `page-raw-edit` and `admin.sessions.*` exist while the permission itself is not covered. So __no configuration change is audited at all__ — the posture is simply the first place that gap becomes intolerable, because the whole point of the section is that an operator can alter the instance's defences from a web form.

It needs a new event type in the registry. That file is a __contract in code rather than configuration__ (`auditRegistry.ts:13`), which is what makes an unimplemented event visible as an exemption instead of an absence, so the event is declared there whether or not the emitting code lands in the same change.

Two properties follow from the rest of this document:

- __A value change and an ingredient add or remove are different events.__ Removing an ingredient changes no value (D4, D16) and is a change to the view; changing a value alters what the instance does. Recording both as "posture changed" would lose the distinction that matters when reading the log back.
- __Secrets never appear in the record.__ D15 excludes them as ingredients, but an audit entry naming a key and its before and after values would reintroduce the disclosure by another route if that list ever grows. `src/utils/redactSecrets.ts` applies here as it does to the view.

__The posture is recorded at boot, and compared against the previous boot.__ Auditing only the changes made through the UI leaves two holes: an `app-custom-config.json` edited directly on disk emits nothing, and neither does the state an instance started in. Recording the posture at every start closes the second; comparing that record against the one from the previous start closes the first, because a change made on disk, or while the process was stopped, shows up as a difference between two consecutive boots even though nothing observed the edit itself.

This is not the self-scoring D20 rejects. The comparison is against __this instance's own previous state__, which is a fact it holds, rather than against a recommended value set nobody can define.

__The record is hash-chained, and that is where its strength comes from.__ `chainEnabled()` returns true unconditionally in `BaseAuditProvider`, so every storing provider stamps every record — `stampRecord(prepared, chainSeq + 1, chainPrevHash)` at `BaseAuditProvider.ts:297`. A posture event is an ordinary audit event and inherits the sequence and the chain with no integrity mechanism of its own. The boot-to-boot comparison therefore rests on a verified chain rather than on trusting a file: a record altered or removed between two boots breaks verification at that point.

__Truncation is detectable as of [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) — landed 2026-09-01 — but only when a witness is configured.__ The chain itself still detects modification and not removal of the tail; what closes the gap is publishing the head where the audited machine cannot rewrite it. `offBox: boolean` is gone: nothing on the machine can verify that a path leaves it, so `getGuarantees()` reports where and when the head was published and the reader judges (D21). With no destination configured, truncation stays undetectable and the report says so rather than claiming otherwise. An operator with write access to the log directory can delete the last records and recompute from there undetected — which is exactly the sequence that matters here: weaken a posture setting, then trim the log behind it. So the posture record is fully auditable against __alteration__ today, and against __deletion__ only once the head is anchored off-box. That makes #1138 a dependency of this design's strongest claim rather than general audit hardening.

__The `CHAIN_RESTART_EVENT` interaction was checked when [#1156](https://github.com/jwilleke/ngdpbase/issues/1156) landed, and there is no collision.__ The previous posture record is found by event type over the loaded records, independent of chain segment, so a restart between two boots does not hide it. The ordering concern does not arise either: `restartAuditChain` is never called automatically — deliberately, because a system that silently repairs its own audit chain is worse than one that stays visibly broken — so it cannot land at the same moment as a boot record.

__One limit worth knowing__, found while implementing this: only the last 1000 lines of the log are loaded for search (`FileAuditProvider.ts:610`). On a busy instance the previous boot's record can fall outside that window, so the comparison reports __unknown__ rather than "no change". Reporting the second from the first would be a false all-clear at exactly the moment an operator is relying on the check.

__The previous posture is read back from the audit log, not from a side file.__ Every storing provider reports `queryable: true` and is tamper-evident when the chain is on (`BaseAuditProvider.ts:219`), so the comparison inherits the integrity the log already has and there is one place the history lives. `NullAuditProvider` guarantees nothing and is not queryable — so an instance deliberately running without auditing has nothing to compare and records nothing, which is the correct outcome rather than a gap: that operator chose no audit trail, and the choice is itself on the record.

The wider gap — that no administrative configuration change is audited — is larger than this epic and belongs in its own issue.

__Issues:__ __Landed 2026-09-01__ across [#1148](https://github.com/jwilleke/ngdpbase/issues/1148) (durability reported, not asserted), [#1149](https://github.com/jwilleke/ngdpbase/issues/1149) (lifecycle events), [#1150](https://github.com/jwilleke/ngdpbase/issues/1150) (configuration changes audited), [#1156](https://github.com/jwilleke/ngdpbase/issues/1156) (the boot record and previous-boot comparison) and [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) (the off-box witness its strongest claim depended on).

### D20 — The instance never scores itself against a recommended posture

Nothing compares an instance's settings to `baseline`, `hardened` or `regulated` and reports how far off it is. No drift warning, no compliance percentage, no red badge for a setting that differs from a recommendation.

The reason is that the thing it would compare against does not exist. There is no authoritative value set for a regulated deployment; consultants in this space err toward caution, and no two auditors agree on the same instance. A number this project invented, rendered as a deviation, would be the software asserting a judgment it cannot support — D2's objection to preset labels, one level further down.

The recommendation pages (D17) remain, and are the right form for this: advice an operator reads and applies, carrying the disclaimer that the decision and its consequences are theirs.

__What replaces it is stronger, not weaker.__ The instance states what it is set to (D5), and every change to that is audited (D19). An assessor gets the current configuration and its full history of changes — facts, with no interpretation layered on top — rather than a score against a benchmark whose provenance nobody can defend.

An optional comparison could be added later as a __log-only__ check, with no bearing on the UI and no editing behaviour attached to it. It is not part of this work.

__Issues:__ A rejection rather than a unit of work. No issue.

### What `ngdpbase.security.profile` does today

Established from the code, because the decision above depends on it. The key ships as `"baseline"` (`app-default-config.json:334`) and has two documented values, `baseline` and `hardened`. It gates no mechanism. It has two live consumers:

1. __It defaults `ngdpbase.audit.on-failure`__ — `AuditManager.ts:364-370`. The explicit key wins; the profile supplies `refuse-boot` on `hardened` and `continue` otherwise.
2. __It decides whether a contradictory egress configuration is fatal__ — `egressPolicy.ts:49` reads it, `app.ts:299-310` acts on it. When the allowed and denied CIDR lists contradict each other, the conflicts are logged either way; on any profile other than `baseline` the instance then refuses to boot, and on `baseline` it drops the offending entries and continues. This consumer arrived with [#1133](https://github.com/jwilleke/ngdpbase/issues/1133), not [#1118](https://github.com/jwilleke/ngdpbase/issues/1118), and it tests `!== 'baseline'` rather than `=== 'hardened'`.

__The first consumer is inert in a stock install.__ `app-default-config.json:339` ships `"ngdpbase.audit.on-failure": "continue"`, so the `configured ||` branch always takes the shipped value and the profile's default is never reached. It applies only if an operator explicitly empties the key. The divergence warning at `AuditManager.ts:375` is therefore the half that actually runs: a `hardened` instance that never touched `on-failure` warns at every boot, and the preset it is warning about never applied. That is worth knowing before deciding what to remove — the auditing preset has almost nothing to regress, while the egress consumer has real behaviour.

### D21 — The report is not called `guarantees`

The [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) report states __facts about what the running system does__. It is not called `guarantees`, and neither is any field generalised from `AuditManager.getAuditPosture()`.

The word was rejected on evidence rather than taste: one of the four existing booleans cannot support it. `BaseAuditProvider.getGuarantees()` returns `durable: this.chainEnabled()`, and `chainEnabled()` is `return true` unconditionally — so every storing provider claims durability. `FileAuditProvider` queues records in memory, flushes on a 30-second timer or at 1000 records, and appends without `fsync`. An unclean exit loses everything in that window, silently: the chain resumes from the last written record at boot, verification passes, and nothing shows anything is absent. Filed as [#1148](https://github.com/jwilleke/ngdpbase/issues/1148).

__And no single-node instance can honestly promise durability anyway.__ It means write, `fsync`, then acknowledge — and even that trusts a controller cache, while a failed disk takes the log with it. Generalising `guarantees` across every subsystem would have propagated a word the strongest subsystem cannot live up to.

So the report states what is measurable — the flush interval, whether refuse-on-failure events are written synchronously, which provider is active and whether it is degraded — and the reader draws the conclusion. That is D20's principle applied to the report: state facts, do not score.

__As of [#1158](https://github.com/jwilleke/ngdpbase/issues/1158) refuse-on-failure events ARE written synchronously__, so that fact now reads the other way. `getDurability()` reports `fsync: false` — `standard` and `volume` events are still buffered — alongside `fsyncedClasses`, which names the event types that are written through and `fsync`ed before the action completes. Naming them rather than flipping the boolean is the same discipline: `fsync: true` would promise durability for the buffered tiers that do not have it, and a bare `false` would hide a guarantee the critical path genuinely provides. A partial guarantee has to be stateable, or it rounds to a claim that is wrong in one direction or the other.

The concrete name is left to #1146, where the report is built. The constraint recorded here is what it may not be, and why.

__Issues:__ Settled by [#1148](https://github.com/jwilleke/ngdpbase/issues/1148), which supplied the evidence, and [#1158](https://github.com/jwilleke/ngdpbase/issues/1158) — __landed 2026-09-02__ — which made the critical tier durable so the report has a stronger fact to state. The report's actual name is [#1146](https://github.com/jwilleke/ngdpbase/issues/1146)'s.

### D22 — Audit storage hardening is operator advice, not new configuration

Pointing the audit log at its own volume needs no new key. `ngdpbase.audit.provider.file.logdirectory` already exists (`app-default-config.json:341`, read at `FileAuditProvider.ts:104`) and is separate from `ngdpbase.logging.dir`, so the two can already diverge although both default to `${FAST_STORAGE}/logs`.

It belongs in the recommendation pages (D17) because of what it does and does not buy:

- __It isolates failure.__ A full or failed content volume does not stop auditing.
- __It enables separation of duties.__ A separate path can carry different ownership and mount options — on Linux, an append-only attribute lets the process add records while preventing it from truncating or rewriting them, which is the only meaningful local mitigation of the truncation gap in [#1138](https://github.com/jwilleke/ngdpbase/issues/1138).
- __It does not make the log durable.__ The gap is the in-memory queue, not the file's location; a different disk takes the same buffered writes at the same moment and loses the same events.
- __It does not survive the machine.__ A separate local disk is the same host, and anyone who can delete records on one path can delete them on the other.

This is exactly the shape of advice D17's pages exist for: an operator hardening choice with a stated benefit and a stated limit, owned by the operator rather than asserted by the software. D23 records the same shape for the witness destination itself.

__Issues:__ Carried by [#1146](https://github.com/jwilleke/ngdpbase/issues/1146)'s recommendation page — __landed 2026-09-01__. The truncation limit it names is [#1138](https://github.com/jwilleke/ngdpbase/issues/1138).

### D23 — Configuring the witness: what it is, and what it is not

[#1138](https://github.com/jwilleke/ngdpbase/issues/1138) built the mechanism; this records how it is set up and, more importantly, the ways it can look like it is working when it is not. Written after configuring it on a live instance, where three of them turned up in the first ten minutes.

__The setting.__ `ngdpbase.audit.chain-witness.destination` is a __file path__, not a directory. The provider appends one JSON line per publication and never rewrites the file:

```json
{"seq":1977,"hash":"7225256d52…","instance":"jimstest","publishedAt":"2026-09-02T08:27:08.940Z"}
```

A sequence number and a hash — a fingerprint, not content. Publishing more would put audit *data* wherever the witness lives, which is a far larger trust decision than publishing a fingerprint of it. Appending rather than overwriting is deliberate: a witness store that can be rewritten reproduces the original problem one hop away, and the history of heads is itself the evidence.

__`interval-minutes` is the security parameter, not a performance knob.__ The gap between publications is exactly the window an attacker can truncate within: publish hourly and the last hour of records can be removed with nothing to notice. It defaults to 60. A zero or negative value publishes on every flush rather than never, so a misconfiguration fails toward more evidence.

__A configuration-file edit needs a restart.__ `ConfigurationManager` loads `app-custom-config.json` at boot and has no file watcher, so editing the file on disk changes nothing until the instance restarts. Setting it through the admin UI instead calls `setProperty`, which updates the running configuration and the file together.

#### The five ways it can be wrong while looking right

__1. The destination is on the same machine as the log.__ This is the one that matters most and the easiest to get wrong, because `${FAST_STORAGE}` is right there in every other path in the file. A witness on the same volume as `audit.log` is deletable by anyone who can delete the log, so it converts the verifier's honest `unknown` into a confident `intact` backed by nothing — __strictly worse than no witness at all__. The destination must be on different hardware.

__2. The mount is absent and the path quietly becomes local.__ If the destination is a network mount, ask what happens when it is not mounted. On macOS this fails safe: `/Volumes` is root-owned, so `ensureDir` gets `EACCES`, the provider logs that truncation is undetectable while no witness is being written, and carries on. That is the correct behaviour and it should be verified rather than assumed on any given host — a platform where the mount point *is* writable would silently create a local directory and start writing an on-box "off-box" witness, which is failure mode 1 arriving by accident.

__3. The instance name is wrong, so one store cannot hold several instances.__ Found on a live instance immediately after configuring it: every witness line said `"instance":"ngdpbase"` on an instance named `jimstest`. The publisher read `ngdpbase.applicationname`, which is spelled `ngdpbase.application-name` everywhere else in the codebase, so the lookup always missed and always took the fallback. Fixed and regression-tested. The general lesson is the one this document keeps arriving at: a field that is never read back is a field nothing checks, and the first read is where it fails.

__4. The credentials to reach the witness are on the audited box.__ A read-write network share reached with credentials stored on the machine is deletable by whoever owns the machine. This defeats a careless truncation — someone who trims the log and does not think about the remote copy — and not a thorough one. It is a real improvement over `unknown` and it is not the strong form.

The strong form is a destination the instance can __add to but not remove from__: an append-only share, a write-once store, or a filesystem with snapshots the instance cannot delete. That is an operator hardening decision, so per D17 it belongs in the recommendation pages rather than in a key this project defines.

__5. The verifier resolves the witness path from the configuration it can see.__ Not a fifth way to be wrong so much as a way to think you are. Running `scripts/verify-audit-chain.ts` from a source checkout reads *that* checkout's configuration, where the destination is empty — so it reports `VERIFIED, BUT UNWITNESSED` for a log whose instance is publishing perfectly well. Pass the witness explicitly when verifying an instance from outside it:

```bash
npx tsx scripts/verify-audit-chain.ts /path/to/audit.log --witness /path/to/audit-witness.jsonl
```

which answers with the statement the whole mechanism exists to make: *the log is consistent with the published head, truncation would have been detected.* An assessor holding their own copy of a head uses `--head <hash>` instead, which is the strongest form because the value never passed through the audited machine's configuration at all.

__What the software says about all of this: nothing.__ Consistent with D13 and D21, the code takes no view on whether a destination is genuinely off-box and never claims that it is — nothing running on the machine can verify that a path leaves it, and asserting so would repeat the `durable: true` defect [#1148](https://github.com/jwilleke/ngdpbase/issues/1148) removed. It reports where it published and when. The operator states what that destination actually is, and owns the claim.

__Issues:__ Mechanism by [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) — __landed 2026-09-01__; the verifier that reads it is [#1161](https://github.com/jwilleke/ngdpbase/issues/1161). The instance-name defect in failure mode 3 was fixed on 2026-09-02.

## Deferred to implementation

Not decisions — settled things that must not be lost when this document is read for its decisions.

- __Three audit issues are filed and linked to the epic__ and D19 depends on them: [#1148](https://github.com/jwilleke/ngdpbase/issues/1148) (`durable` asserted but not delivered), [#1149](https://github.com/jwilleke/ngdpbase/issues/1149) (`system-start` / `system-shutdown`, so an unclean exit is detectable) and [#1150](https://github.com/jwilleke/ngdpbase/issues/1150) (no administrative configuration change is audited anywhere).
- __Check the `CHAIN_RESTART_EVENT` interaction__ ([#1124](https://github.com/jwilleke/ngdpbase/issues/1124)) when implementing D19. A boot-time posture record and a declared chain discontinuity can land at the same moment, and their order matters.
- ~~__Correct two pieces of wording when D11 lands.__ `views/admin-dashboard.ejs:31` says setting `refuse-boot` makes the failure "fatal instead"; `config/app-default-config.json:338` says it "refuses to start". Both describe a process that exits.~~ __Done__ — both corrected by [#1157](https://github.com/jwilleke/ngdpbase/issues/1157) and guarded by `postureDocsConsistency.test.ts`.
- ~~__Rewrite [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) and `docs/planning/security-profile.md`__, which both still describe the preset model D2 replaced.~~ __Done.__ [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) was rewritten on 2026-09-01 and `security-profile.md` carries a superseded banner. The sweep was completed on 2026-09-02: `docs/managers/ConfigurationManager.md`, `docs/planning/Security-auditing.md` and three code comments also described the recommendations as configuration, and were corrected.
- __Gating of the [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) report__ is deliberately that issue's decision, not this document's (D18).

## Open decisions

These are being worked one at a time; each is recorded above as it is settled.

*None.* Every decision above names the issue that carries it. [#1137](https://github.com/jwilleke/ngdpbase/issues/1137) closed on 2026-09-02 with all twelve of its sub-issues completed and all twelve of its acceptance criteria met; further posture work is filed fresh against this document.
