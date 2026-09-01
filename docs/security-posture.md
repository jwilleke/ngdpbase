# Security posture

The decision record for how an ngdpbase instance declares and inspects its security-related settings.

This file records __decisions and their reasons__. The exploratory design that preceded it lives in [planning/security-profile.md](./planning/security-profile.md); where the two disagree, this file wins and the older document is to be corrected. Tracked by [#1137](https://github.com/jwilleke/ngdpbase/issues/1137).

## Decisions

### D1 — "Security posture" is the official term

The set of security-related settings an instance is running is its __security posture__. That is the name used in documentation, the admin UI, issues and commit messages.

Consequence to resolve: `AuditManager.getAuditPosture()` already uses the word for what auditing currently *does* (provider, degraded, reason). That usage is compatible — it reports actual state, which is what a posture is under D2 — but the naming should be reconciled when [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) generalises it.

__Issues:__ [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) __landed 2026-09-01__ as recommendation content. No general report was built: D2 and [#1145](https://github.com/jwilleke/ngdpbase/issues/1145) satisfy rule 3 structurally, so the name D21 rejected never needed a replacement.

### D2 — There is one posture: the active one

An instance has __one security posture__, and it is the settings it is actually running. There is no catalogue of selectable posture objects and no preset layer.

`baseline`, `hardened` and `regulated` are __documented recommendations__ — value sets this project publishes as advice for a deployment shape. They are prose and tables, not configuration objects. An operator reads the one matching their situation and is accountable for setting their instance to their own requirements.

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

The tie break was a behaviour __change__, not just a re-homing. Previously a range in both lists was dropped from __both__, so the operator's stricter statement was discarded along with the looser one and the range fell back to the built-in defaults. Now the deny survives.
| A range does not parse as CIDR | No prefix to compare. See D9. |

__No case refuses to start the instance.__ That was the profile looking for a job, and it is not the convention: `iptables` rejects a bad rule and keeps the chain, and the Kubernetes API server rejects an invalid NetworkPolicy while the other policies keep applying. Neither takes the workload down.

__Issues:__ Tracked by [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) — __landed 2026-09-01__; the behaviour re-homed came from [#1133](https://github.com/jwilleke/ngdpbase/issues/1133). The malformed-CIDR case it defers to D9 is [#1152](https://github.com/jwilleke/ngdpbase/issues/1152), which is now the only thing standing between a malformed deny rule and it silently not applying.

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

__Issues:__ A standing design rule rather than a unit of work. No issue.

### D14 — `refuse-boot` keeps its name

`ngdpbase.audit.on-failure` keeps `continue` and `refuse-boot` as its values. No rename.

The name is still accurate under D12. `engineReady = false` means the boot did not complete — the instance refuses to finish booting and serves the maintenance page instead. The process staying alive to say so is not the boot succeeding; it is the boot being refused in a way that leaves a route to the fix. `refuse-boot` describes that.

Two pieces of __wording__ do become wrong when D11 lands, and they are the thing to correct rather than the value:

- `views/admin-dashboard.ejs:31` tells the operator to set `refuse-boot` "to make this fatal instead". Under D11 it is not fatal, it is blocking.
- `config/app-default-config.json:338` says `refuse-boot` "names the provider and the cause and refuses to start". It still names both, and it does refuse to start serving, but "refuses to start" reads as the process exiting.

__Issues:__ Settled here. The wording corrections it names are carried by [#1152](https://github.com/jwilleke/ngdpbase/issues/1152) and are still outstanding — `views/admin-dashboard.ejs:31` and `config/app-default-config.json:338` both still describe a process that exits.

### D15 — The ingredients of the shipped posture

`ngdpbase.security.profile` becomes `ngdpbase.security.posture`, a JSON object holding the ingredients of the active posture.

A pattern match over `config/app-default-config.json` for security-shaped names returns 86 keys, which is the wrong list — most are plumbing, and a few must never be displayed at all. Two exclusion rules cut it down:

- __Never an ingredient: anything in `ngdpbase.config.secret-keys`__ — `session.secret`, `user.security.passwordsalt`, `user.security.defaultpassword`, `addons.demo.admin-account.password`, `mail.provider.smtp.pass`, `auth.google-oidc.client-secret`, `dawarichCompat.apiKey`. A collapsible section that renders these is a disclosure, not a report. `src/utils/redactSecrets.ts` already exists for exactly this and the view reuses it.
- __Never an ingredient: plumbing and integration wiring__ — directories, filenames, queue sizes, flush intervals, callback URLs, client IDs, team domains. They change how a subsystem runs, not what the instance guarantees.

What remains, grouped as the admin section would group them:

| Group | Ingredients |
|---|---|
| Egress boundary | `security.egress.allowed-ranges`, `security.egress.denied-ranges` |
| Session and cookie | `session.secure`, `session.http-only`, `session.max-age`, `server.trust-proxy` |
| Identity and registration | `auth.password.enabled`, `auth.required-factors`, `application.registration`, `application.registration.password`, `auth.user.default-external`, `auth.magic-link.auto-provision`, `auth.magic-link.ttl-minutes`, `auth.google-oidc.auto-provision` |
| Login throttling | `auth.throttle.enabled`, `.max-attempts`, `.window-minutes`, `.lock-minutes`, `.max-lock-minutes` |
| Agent tokens | `auth.agent-token.enabled`, `.max-per-user`, `.max-ttl-hours`, `.default-ttl-hours`, `.retention-days` |
| Audit | `audit.enabled`, `audit.provider`, `audit.on-failure`, `audit.read-events`, `audit.retentiondays` |
| Content sanitisation | `filters.security.enabled`, `.prevent-xss`, `.prevent-csrf`, `.sanitize-html`, `.strip-dangerous-content`, `.block-on-save`, `.allowed-tags`, `.allowed-attributes`, `style.security.allow-inline-css`, `style.security.allowed-properties` |
| Rate limiting | `mail.rate-limit.enabled`, `.max-submissions`, `.window-minutes` |

`server.trust-proxy` is in the session group deliberately: `resolveSessionSecurity()` reads the two together, and `app.ts:398` already warns when `session.secure` is on while `trust-proxy` is explicitly false. An ingredient list that showed one without the other would hide half of a known interaction.

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

This is not covered today. `src/utils/auditRegistry.ts` marks `admin-system` as `exempt: 'not-implemented'`, with the note that `admin.page.raw-edit` and `admin.sessions.*` exist while the permission itself is not covered. So __no configuration change is audited at all__ — the posture is simply the first place that gap becomes intolerable, because the whole point of the section is that an operator can alter the instance's defences from a web form.

It needs a new event type in the registry. That file is a __contract in code rather than configuration__ (`auditRegistry.ts:13`), which is what makes an unimplemented event visible as an exemption instead of an absence, so the event is declared there whether or not the emitting code lands in the same change.

Two properties follow from the rest of this document:

- __A value change and an ingredient add or remove are different events.__ Removing an ingredient changes no value (D4, D16) and is a change to the view; changing a value alters what the instance does. Recording both as "posture changed" would lose the distinction that matters when reading the log back.
- __Secrets never appear in the record.__ D15 excludes them as ingredients, but an audit entry naming a key and its before and after values would reintroduce the disclosure by another route if that list ever grows. `src/utils/redactSecrets.ts` applies here as it does to the view.

__The posture is recorded at boot, and compared against the previous boot.__ Auditing only the changes made through the UI leaves two holes: an `app-custom-config.json` edited directly on disk emits nothing, and neither does the state an instance started in. Recording the posture at every start closes the second; comparing that record against the one from the previous start closes the first, because a change made on disk, or while the process was stopped, shows up as a difference between two consecutive boots even though nothing observed the edit itself.

This is not the self-scoring D20 rejects. The comparison is against __this instance's own previous state__, which is a fact it holds, rather than against a recommended value set nobody can define.

__The record is hash-chained, and that is where its strength comes from.__ `chainEnabled()` returns true unconditionally in `BaseAuditProvider`, so every storing provider stamps every record — `stampRecord(prepared, chainSeq + 1, chainPrevHash)` at `BaseAuditProvider.ts:297`. A posture event is an ordinary audit event and inherits the sequence and the chain with no integrity mechanism of its own. The boot-to-boot comparison therefore rests on a verified chain rather than on trusting a file: a record altered or removed between two boots breaks verification at that point.

__Truncation is detectable as of [#1138](https://github.com/jwilleke/ngdpbase/issues/1138) — landed 2026-09-01 — but only when a witness is configured.__ The chain itself still detects modification and not removal of the tail; what closes the gap is publishing the head where the audited machine cannot rewrite it. `offBox: boolean` is gone: nothing on the machine can verify that a path leaves it, so `getGuarantees()` reports where and when the head was published and the reader judges (D21). With no destination configured, truncation stays undetectable and the report says so rather than claiming otherwise. An operator with write access to the log directory can delete the last records and recompute from there undetected — which is exactly the sequence that matters here: weaken a posture setting, then trim the log behind it. So the posture record is fully auditable against __alteration__ today, and against __deletion__ only once the head is anchored off-box. That makes #1138 a dependency of this design's strongest claim rather than general audit hardening.

Whoever implements this should also check the interaction with `CHAIN_RESTART_EVENT` (`audit.chain-restart`, [#1124](https://github.com/jwilleke/ngdpbase/issues/1124)), which declares a deliberate discontinuity after a migration or restore. A boot-time posture record and a chain restart can land at the same moment, and their order matters.

__The previous posture is read back from the audit log, not from a side file.__ Every storing provider reports `queryable: true` and is tamper-evident when the chain is on (`BaseAuditProvider.ts:219`), so the comparison inherits the integrity the log already has and there is one place the history lives. `NullAuditProvider` guarantees nothing and is not queryable — so an instance deliberately running without auditing has nothing to compare and records nothing, which is the correct outcome rather than a gap: that operator chose no audit trail, and the choice is itself on the record.

The wider gap — that no administrative configuration change is audited — is larger than this epic and belongs in its own issue.

__Issues:__ Tracked by [#1148](https://github.com/jwilleke/ngdpbase/issues/1148) (durability reported, not asserted — __landed__), [#1149](https://github.com/jwilleke/ngdpbase/issues/1149) (lifecycle events — __landed__) and [#1150](https://github.com/jwilleke/ngdpbase/issues/1150) (configuration changes audited — __landed__). Its strongest claim depends on [#1138](https://github.com/jwilleke/ngdpbase/issues/1138), which anchors the chain head off-box.

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

So the report states what is measurable — the flush interval, whether the critical tier is written synchronously, which provider is active and whether it is degraded — and the reader draws the conclusion. That is D20's principle applied to the report: state facts, do not score.

The concrete name is left to #1146, where the report is built. The constraint recorded here is what it may not be, and why.

__Issues:__ Settled by [#1148](https://github.com/jwilleke/ngdpbase/issues/1148), which supplied the evidence. The report's actual name is [#1146](https://github.com/jwilleke/ngdpbase/issues/1146)'s.

### D22 — Audit storage hardening is operator advice, not new configuration

Pointing the audit log at its own volume needs no new key. `ngdpbase.audit.provider.file.logdirectory` already exists (`app-default-config.json:341`, read at `FileAuditProvider.ts:104`) and is separate from `ngdpbase.logging.dir`, so the two can already diverge although both default to `${FAST_STORAGE}/logs`.

It belongs in the recommendation pages (D17) because of what it does and does not buy:

- __It isolates failure.__ A full or failed content volume does not stop auditing.
- __It enables separation of duties.__ A separate path can carry different ownership and mount options — on Linux, an append-only attribute lets the process add records while preventing it from truncating or rewriting them, which is the only meaningful local mitigation of the truncation gap in [#1138](https://github.com/jwilleke/ngdpbase/issues/1138).
- __It does not make the log durable.__ The gap is the in-memory queue, not the file's location; a different disk takes the same buffered writes at the same moment and loses the same events.
- __It does not survive the machine.__ A separate local disk is the same host, and anyone who can delete records on one path can delete them on the other.

This is exactly the shape of advice D17's pages exist for: an operator hardening choice with a stated benefit and a stated limit, owned by the operator rather than asserted by the software.

__Issues:__ Carried by [#1146](https://github.com/jwilleke/ngdpbase/issues/1146)'s recommendation page — __landed 2026-09-01__. The truncation limit it names is [#1138](https://github.com/jwilleke/ngdpbase/issues/1138).

## Deferred to implementation

Not decisions — settled things that must not be lost when this document is read for its decisions.

- __Three audit issues are filed and linked to the epic__ and D19 depends on them: [#1148](https://github.com/jwilleke/ngdpbase/issues/1148) (`durable` asserted but not delivered), [#1149](https://github.com/jwilleke/ngdpbase/issues/1149) (`system.start` / `system.shutdown`, so an unclean exit is detectable) and [#1150](https://github.com/jwilleke/ngdpbase/issues/1150) (no administrative configuration change is audited anywhere).
- __Check the `CHAIN_RESTART_EVENT` interaction__ ([#1124](https://github.com/jwilleke/ngdpbase/issues/1124)) when implementing D19. A boot-time posture record and a declared chain discontinuity can land at the same moment, and their order matters.
- __Correct two pieces of wording when D11 lands.__ `views/admin-dashboard.ejs:31` says setting `refuse-boot` makes the failure "fatal instead"; `config/app-default-config.json:338` says it "refuses to start". Both describe a process that exits.
- __Rewrite [#1144](https://github.com/jwilleke/ngdpbase/issues/1144) and `docs/planning/security-profile.md`__, which both still describe the preset model D2 replaced.
- __Gating of the [#1146](https://github.com/jwilleke/ngdpbase/issues/1146) report__ is deliberately that issue's decision, not this document's (D18).

## Open decisions

These are being worked one at a time; each is recorded above as it is settled.

*None.* Every decision above names the issue that carries it, and the epic carries seven sub-issues.
