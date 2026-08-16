# Guiding framework

How this codebase is put together, stated as rules rather than as an argument for them. Written for maintainers working here and for anyone building on the same core.

Every rule below is implemented in `src/` today. Where a rule is only partly implemented, that is said in [Known gaps](#known-gaps) rather than left for the reader to discover.

The rules are domain-neutral. Nothing in the model below mentions pages, media or records — that is deliberate, and it is what makes the same core serve a different application.

## The invariant

**All code that touches a resource goes through that resource's manager. There is no second path.**

Everything else follows. Access logging, authorization, backup and encryption are each truthful only if the chokepoint is real:

- **Access logging.** "Who read this" is answerable only if every read passed one place. A path that reaches around does not make the log incomplete — it makes it wrong, and silently.
- **Authorization.** A policy evaluated at the door is enforced once. A policy evaluated in twenty-five handlers is bypassed by the twenty-sixth.
- **Backup.** A manager can answer "how are you backed up" only because it sees every write.
- **Encryption.** Same door, same argument.

A manager is justified by being the only door to a resource — not by having alternative implementations, and not by symmetry with any existing list. The test is: *is this a resource, and would code otherwise reach it directly?* If two managers own the same store, neither is a chokepoint and the invariant is already gone.

## The model

1. A resource has exactly one manager, and no other path reaches it.
2. Context is request-scoped and says who is asking. It is passed into managers; managers are not reached through it.
3. Managers decide and act. Providers implement and return. A provider reports a result; only the manager turns that result into an effect.
4. Configuration binds capabilities to providers; providers supply behaviour. Config selects and parameterises. It never expresses logic.
5. A capability that is not configured is never loaded.
6. Every action on a resource is a named permission, declared as data in one registry, formatted `{target}-{action}`.
7. Roles collect permissions. A flat list, unordered, additive only.
8. Capability and scope are separate. A role says what may be done; the assignment says over which subjects. Neither is encoded in the other's name.
9. Evaluation is tiered, and the resource's own attributes beat global policy.
10. Decisions come in two forms: one item, or a filter over many. Both are part of the contract.
11. Access without an account is a principal, not a bypass.
12. Each of these is an invariant, so each needs a check that fails when it is broken.

Rules 6 through 11 are enforceable only because of rule 1.

## Layering

Three layers, one job each.

| Layer | Scope | Job | May not |
|---|---|---|---|
| Context | One request | Carry who is asking — subject, roles, request/response | Be a service locator that bypasses a manager |
| Manager | One resource | Decide, enforce policy, audit, turn a result into an effect | Reach another resource's store |
| Provider | One capability | Do the work and return a result | Act on that result |

The provider-returns-a-result ordering is what makes auditing trustworthy: because the provider only reports, the manager is the single place where a success becomes a session, an audit entry, or a counter. Two providers cannot each write half a story.

### Context

Build the context fresh per request from session state. A session outlives a request, so authorization facts cached for a session go stale inside it — a role is revoked, an account disabled, a password changed, and a long-lived context still says admin.

Two kinds of field live in it, with opposite safety needs:

- **Authorization facts** — subject, roles, scope, token generation. Built once at the edge, then treated as immutable. A handler that can write to the context can widen its own permissions.
- **Request incidentals** — locale, timezone, theme, user agent, client IP. Mutable and harmless.

Holding the engine on the context is fine. The hazard was never `ctx.engine`; it is `ctx.engine.getManager('x').store` — reaching past a manager. That is what the boundary rule forbids.

### Managers are gates, not piles

"One door" is not "one class". A manager that accumulates every function touching a resource becomes a god object; the manager is the gate, the provider is the implementation behind it. `src/managers/UserManager.ts` is the worked counter-example in this repo — see [Known gaps](#known-gaps).

## Capabilities, providers and configuration

A **capability** is one job: audit storage, search index, cache, authentication. A **provider type** is a reusable implementation of that job. The **binding** is what configuration chooses, and one type may be bound several times with different settings.

### Configuration convention

```text
ngdpbase.<capability>.provider              the selection
ngdpbase.<capability>.provider.default      the fallback
ngdpbase.<capability>.provider.<name>.*     settings for one provider
```

Config selects and parameterises. It never expresses logic. A conditional that lives in a config value is a conditional nobody can test.

### An inert default

A capability should have a `Null` or `console` provider, and it should be the default, so the system is never broken for want of configuration — it degrades to inert. An unconfigured mail transport logs the message instead of failing, which is why a demo instance cannot email strangers by accident.

The inert default need not be a `Null` provider — it needs to be an implementation that cannot fail for want of configuration. Audit and cache use `Null` providers and mail defaults to `console`, while search defaults to an in-process index requiring no external service and no settings, and falls back to it when a configured provider fails to load. A `Null` search provider would be worse than the default it replaced: silence instead of a working index.

The test is therefore not "does a `Null` implementation exist" but "can this capability be left unconfigured without breaking".

### Not configured means not loaded

The gate must be a **dynamic `import()` inside the factory**. A top-level import of the implementation defeats config gating entirely: the module loads and its native bindings initialise regardless, and the config key only decides whether it is called.

The saving is rarely memory. It is dependency weight — an image toolchain, a headless browser, a Redis client — and it is attack surface. Code that never loads cannot be exploited.

Two rules keep this from becoming a different bug:

- **Absent must not mean null.** If `getManager('x')` returns null, every call site needs a check and the one that forgets crashes on real data. Keep the capability addressable and make the *implementation* inert.
- **Absent must be visible.** Log the resolved provider set at boot. Inert is fine; inert and invisible is a support ticket.

### Cardinality is a property of the capability

| Cardinality | Examples | On failure |
|---|---|---|
| One active | storage, cache, search index | The capability is down |
| Any-of (alternatives) | password *or* OIDC *or* magic link | A failed attempt — never a silent fallback to the next provider |
| All-of (factors) | password *and* TOTP | Denied |
| Broadcast | audit sinks, notifications | A policy decision, declared per capability |

Any-of and all-of look identical in configuration and have opposite security properties. A list meaning *all of these* wired as "try each until one succeeds" turns multi-factor into a bypass, because the attacker presents the single factor they hold. When a capability is all-of, write the test before the feature.

For a one-active capability, switching providers is a data migration — which is what `backup()` and `restore()` from the base contract are for.

### Required versus optional capabilities

A capability declares whether it is required.

- **Optional** capabilities fall back to inert on a load error or failed health check, and log it.
- **Required** capabilities refuse to boot.

The precedent for refusing is already here: the magic-link provider will not register unless `ngdpbase.application.base-url` is set explicitly, because a token in a URL is a credential and must not point at the localhost default.

### The extension path is the path built-ins use

Addons register through the same public method the built-ins call. If built-ins take a privileged shortcut, the path adopters depend on is the path nobody exercises. `AuthManager.registerProvider()` is the reference implementation: all six shipped auth providers go through it.

Registration is first-wins on a duplicate id, and the reason is security rather than tidiness — last-wins would let a contributed provider replace the built-in password provider's `verify()`.

## Authorization

### Permissions

Named `{target}-{action}` — target first, hyphen separated, URL-safe — and declared as data in one registry.

Two splits are load-bearing rather than stylistic:

- **Export is separate from read.** Reading one item on screen and extracting the whole set to a file are different acts with different risk: access versus disclosure.
- **Search is a target, not an action.** Search leaks existence. "3 results you may not open" already discloses that they exist.

### Roles

A role is a list of permission strings and nothing more. Flat (no roles inside roles), unordered (no entry beats another), additive only (every entry grants; none takes away).

- A `system` flag separates built-in roles from operator-created ones, so an administrator cannot quietly redefine what a role means.
- `anonymous` is a role, not an `if` somewhere. The unauthenticated path goes through the same evaluator with a near-empty permission list.

Because roles are additive, they cannot express "everything except". The tiered evaluator answers that instead of deny entries.

### Scope is never in a name

Not `record-read-patient-123` as a permission, and not `guardian-of-alice` as a role. Both explode combinatorially and neither can be listed in a registry. The role stays scope-free; the **assignment** carries the scope.

### The evaluator is tiered

Resource-level attributes beat global policy. That ordering is how "everything except" is expressed: sensitivity is a property of the resource, not of the grant, so it belongs on the resource.

### Deciding one and filtering many are both first-class

- `decide(ctx, action, resource)` for a single item
- `filter(ctx, action, query)` — policy compiled into a query predicate for lists

If only the first exists, list endpoints grow their own path, and that path will not be audited. **Anything that lists resources must reach the same evaluator as the thing that decides access to one.** A lister that reimplements the check will eventually disagree with it, and the disagreement is silent in both directions: it can list what it should hide, and hide what it should list.

### Access without an account

A share token resolves to a principal and goes through the same evaluator. A separate route tree is structurally where a second door appears — those handlers must resolve the token into a subject, not answer access questions themselves.

## Contracts

`BaseManager` requires `initialize(config)`, `shutdown()`, `backup()` and `restore()`. Provider base classes repeat `backup`/`restore` as abstract, so neither level can exist without answering it.

Backup is therefore not a feature some managers have. It is part of what it means to be a manager, and it is the same mechanism that makes a one-active capability migratable.

## Rules that keep the model honest

These are the failure shapes this codebase has actually produced. Each is now a rule.

- **One rule, one implementation.** When the same policy is decided in more than one place, the copies drift, and the drift is silent because every copy still passes its own tests. Extract the decision; let the callers call it.
- **A cached copy of an authorization attribute is not authoritative.** Denormalised fields are written at save time, so any record not re-saved since the field appeared carries a stale value. Use the cache to enumerate; read the record to decide.
- **Fail closed when a fact cannot be resolved.** "We could not tell" must never become "allow" or "list it".
- **A type must admit the fields that actually travel.** A field passed through but undeclared compiles clean when a provider misspells it, and silently delivers nothing.
- **Two settings that are only correct together are one decision.** Resolve them in one place; a valid-looking combination that cannot work should be refused at boot with a message naming the symptom.
- **A template renders what the route hands it.** Data derived inside a view cannot be shared or tested, and a second view will derive it differently.
- **State the absence.** A count of zero and an unanswered question look identical in a log; say which one it is.

## Enforcement

A rule that lives only in a document decays at the first deadline, and its decay is invisible — the code still works and the tests still pass. Each rule needs a check that fails.

Present in this repo:

- Structured-data invariant test, docs-coverage and docs-index checks, and a client-fetch guard, all wired into the pre-commit hook
- A static invariant test asserting that every view calling a shared template helper is rendered by a route that supplies it

Worth adding wherever this core is used:

- **A store-boundary lint rule** — only `managers/` may import from `providers/`; everything else goes through a manager ([#1057](https://github.com/jwilleke/ngdpbase/issues/1057)). Cheapest to add while the count of exceptions is small: here it is two, both benign — the logger, which bootstraps before any manager exists, and one type-only import that erases at compile time.
- **A registry-drift test** — assert that every permission in config is checked somewhere in code, and that every permission checked in code exists in config ([#1058](https://github.com/jwilleke/ngdpbase/issues/1058)). It catches drift in both directions: an orphan permission that protects nothing, and a check spelled `x-view` where the registry says `x-read`. One fails open and looks fine; the other fails closed and also looks fine.

Both are currently clean here — zero orphan permissions, zero unregistered checks, two justified boundary exceptions. That is the argument for writing the checks now: a passing guard written today pins a property, while the same guard written after the first drift is a bug report.

Whatever the check, prove it fails before trusting it. A static scan that matches nothing passes vacuously, and a guard nobody has watched go red is a guard nobody knows works.

## Extending this core

| The core owns | The application supplies |
|---|---|
| Engine and lifecycle, configuration system, manager and provider base contracts, authentication, policy evaluator, audit, users, roles and sessions, backup and restore contract, share tokens, the permission registry mechanism | Its resources and their managers, the permission registry contents, its scope resolver, its providers, its UI |

The core cannot know what a resource means, yet the evaluator needs scope. So `resource → scope` resolution is an application-supplied extension point. If resource-specific knowledge is hardcoded in the evaluator, the next application forks on day one.

A useful measure for anyone adopting this: count the edits to core files needed to build your application, and justify each one in writing. Every edit is a seam in the wrong place. The count is only useful if somebody keeps it.

## Verified inventory

Measured against this repository at v4.10.0. Included so the model above can be checked rather than taken on trust.

| Fact | Value |
|---|---|
| TypeScript in `src/`, excluding tests | ~104,500 lines |
| Managers | 38, plus `BaseManager` |
| Providers | 36 |
| Permissions in the registry | 19, across 5 targets |
| Auth providers, all registered through the public method | 6 |
| Capabilities safe to leave unconfigured | audit and cache (`Null` providers), mail (`console`), search (in-process index) |

## Known gaps

Stated as facts, each re-verified against `src/` at v4.10.0 rather than inferred from a file listing. None is resolved by the model above.

- **Provider resolution is a convention, not a mechanism.** Ten managers each repeat the same sequence — read the key, apply the default, normalise the name, dynamic-import — and no shared factory exists. It is consistent because everyone remembers, not because anything enforces it. One factory mapping `(capability, config) → instance` would remove the repetition and make a fake injectable in tests without touching config files.
- **Boot ordering is an explicit hand-written list, with no validation.** Thirty-eight managers are registered in source order, and nothing declares or checks a dependency. A manager initialising before the configuration it reads does not crash — it silently takes defaults, which is worse.
- **Per-manager `backup()` yields a torn snapshot across managers.** Nine managers implement `backup()` and nothing quiesces or orders them, so the parts are captured at different instants. Each manager can answer for itself; the coordination is engine-level work that is not designed.
- **`UserManager` is 1,682 lines** carrying password hashing, permission resolution, middleware and page creation, with three role methods left as `never` after a split to `RoleManager`. It is the example of a single path being read as a single class.
- **Authorization fields on the context are optional.** Because `undefined` is falsy, a missing value fails closed by luck rather than by design.
- **`required-factors` is declared but never enforced.** The key is read into `AuthManager` at boot and exposed by `getRequiredFactors()`, which nothing outside its own tests calls. Its documented meaning is "must be satisfied, in order" — an all-of list — while six providers are registered simultaneously as alternatives. Whoever implements multi-factor must satisfy every entry; wiring it as "try each until one succeeds" turns the same config into a bypass, because an attacker presents the single factor they hold.
- **No restart-required marker on configuration keys.** The config carries a `secret-keys` marker but no restart marker, while the admin UI can write any key at runtime via `setProperty`. Changing a provider binding that way leaves stated and actual configuration disagreeing silently.
