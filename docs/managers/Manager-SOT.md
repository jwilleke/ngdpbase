---
name: Manager source-of-truth plans
description: "Where each fact lives and which manager owns it — the standing rule, the current violations, and the plan to fix them. Starts with the access-control subject"
dateModified: '2026-09-20'
category: managers
---

# Manager source of truth

This file holds the plans for fixing __separation of duties__ between managers: which manager owns
a fact, and which managers merely ask for it.

It is a working document, and the plan behind epic
[#1431](https://github.com/jwilleke/ngdpbase/issues/1431). Each subject gets its own section: what
the rule is, what the code does today with evidence, and the plan. When a plan is finished, the
section stays as the record of what was decided and why.

## The rule

__One fact, one owner.__ A second copy is not redundancy — it is a future contradiction, because the
copies drift and nothing says which is current.

### ConfigurationManager is the merger

__Every implementation reads its configuration through `ConfigurationManager`, and through nothing
else.__ It is the single component that merges the layers, so a manager, provider, plugin or addon
asking `getProperty(key, default)` gets the same answer as everybody else — including whatever the
operator changed.

The merge, lowest first ([guiding-framework.md](../guiding-framework.md)):

- 1 the shipped `config/app-default-config.json` — base defaults, read-only;
- 2 each enabled addon's `config/default-config.json`, bundled or external ([#1220](https://github.com/jwilleke/ngdpbase/issues/1220));
- 3 the operator's `app-custom-config.json` in the instance data folder.

Maps merge per entry and `id` arrays merge by `id`, so an addon adds a permission definition or a
policy without touching a shipped entry, and the operator can still override any of it. That is why
a permission declared by the calendar addon is as real as one shipped in core.

What follows from this for every plan in this file:

- __No implementation parses a config file itself__, and none imports the JSON. The merge exists so
  that layer 2 and layer 3 cannot be bypassed, and a direct read bypasses both.
- __No implementation keeps its own copy of a merged value__ beyond what it needs for the moment.
  A `Map` snapshotted at boot is a second source of truth the operator cannot change without a
  restart — see the role catalogue in Subject 1.
- __A value that an operator should be able to change belongs in the config__, not in code. A list
  of permission names written into a source file is a grant nobody can edit.

Applied to managers, the rule splits three ways:

| Kind of fact | Where it lives | Example |
| --- | --- | --- |
| __Declaration__ — what exists | the merged configuration, always through `ConfigurationManager` | which permissions exist; which roles exist; which policies grant what |
| __Data__ — what is true right now | a provider, behind its manager | which person holds which role; who owns a page |
| __Decision__ — the answer to a question | derived at the moment it is asked, never stored | may this identity open this door |

A decision is never stored, because a stored decision is authority frozen at the moment it was
written. A declaration is never copied into data, because the copy is what drifts.

## Subject 1 — access control

__Status:__ analysed 2026-09-20, plan below, __not started__. Tracked by epic [#1431](https://github.com/jwilleke/ngdpbase/issues/1431).

### The one question

An identity arrives at a door. Does it have the permission to open it? Access requires a
__permission__, never a role: roles bundle permissions when granting, and a role's contents can
change, so a door that asks about a role is asking the wrong thing.

### What the code does today

Six participants, no single owner:

| Component | Lines | What it does today |
| --- | --- | --- |
| `PolicyEvaluator` | 316 | Matches a subject against policies. __This is what actually decides.__ Not a manager in name |
| `PolicyManager` | 129 | Holds policies read from config at boot, behind `ngdpbase.access.policies.enabled`. `getPolicy` / `getAllPolicies`. __Decides nothing.__ Its admin create/update/delete are called by routes and do not exist ([#1216](https://github.com/jwilleke/ngdpbase/issues/1216)) |
| `ACLManager` | 1,446 | Re-reads `ngdpbase.access.policies` itself rather than asking `PolicyManager` (`:193`, `:241`); parses page ACL markup; decides page access; filters page and media lists; __and__ holds maintenance mode, business hours, holiday and time restrictions, plus access-decision logging |
| `UserManager` | — | Owns the permission catalogue (read live) and the role catalogue (snapshotted into a `Map` at boot); builds subjects; syncs role membership; and __copies the role catalogue into each role record__ at create time (`getOrCreateRoleRecord`, `:1967`) |
| `RoleManager` | — | Storage door for `OrganizationRole` records. Reads config only for its storage directory and provider name — never the role catalogue |
| `FileRoleProvider` | — | One JSON file per role under `ngdpbase.application.roles.storagedir` (default `./data/roles`) |

### Where they overlap

The same job done in more than one place, with evidence. This is the list the plan has to collapse.

__1 Reading the policies.__ Two owners for one config key.

- `PolicyManager.initialize` reads `ngdpbase.access.policies` into a Map (`:83`), behind
  `ngdpbase.access.policies.enabled` (`:76`).
- `ACLManager` reads the same key itself, twice (`:193`, `:241`), and never asks `PolicyManager`.
- So the `enabled` flag gates one reader and not the other. It ships `true`, so this is latent
  rather than live: set it false and `PolicyManager` holds nothing while `ACLManager` keeps
  deciding from its own read.

__2 Mapping an action to a permission.__ Three vocabularies for one idea.

- The registry: `{target}-{action}`, hyphens — `page-read`, `page-edit` (`ngdpbase.permissions.definitions`).
- `ACLManager.checkDefaultPermission` (`:1029`) maps `view`/`edit`/`delete`/`create` to
  __colon__ names — `page:read`, `page:edit` — which are declared nowhere, so the check can only
  ever deny. Tracked as [#1174](https://github.com/jwilleke/ngdpbase/issues/1174).
- `canAccess(action, page)` uses a third set — bare `view` / `edit` — registered nowhere at all.

__3 Answering "may this identity do this".__ Several doors into one question.

- `UserManager.hasPermission(subject, action)` — the capability door, which runs the token and
  share ceilings and then calls `PolicyEvaluator.evaluateAccess`.
- `BaseContext.hasPermission(action)` — the per-request door, which forwards to the above.
- `ACLManager.checkPagePermissionWithContext`, `canUserAccessPage`, `evaluatePagePermission`,
  `performStandardACLCheck`, `checkDefaultPermission` — five entry points for the page question,
  with their own ordering of ACL markup, audience and policy.
- Nothing states which of these is canonical, so a caller picks by habit.

__4 Holding the role catalogue.__ Four copies of "what a role permits".

- `ngdpbase.access.policies` — enforced.
- Each role's inline `permissions[]` in `ngdpbase.roles.definitions` — display only, hand-synced
  (#713).
- `UserManager.roles`, a `Map` snapshotted from the catalogue at boot (`:383`) — used for the admin
  UI and for validating that a role exists.
- The `permissions` snapshot copied into each `OrganizationRole` record at create time
  (`UserManager.getOrCreateRoleRecord`, `:1967`), which later catalogue edits never update, plus
  per-record overrides.

__5 Reading the permission catalogue.__ `UserManager` reads it live (`:301`);
`ConfigAccessorPlugin` reads the same key for rendering (`:1285`). Two readers is fine — worth
listing only because it is the one duplication here that is __not__ a problem: both read, neither
stores.

__6 Not an overlap, contrary to appearances.__ Role __membership__ has a single owner.
`resolveUserRoles` (`:1818`) reads `RoleManager` records and nothing else; the legacy
`User.roles[]` fallback was removed in #617 iteration 3b, with `scripts/strip-user-roles.ts` to
clear the deprecated field. One hazard to keep in view: it returns `[]` — no roles at all — when
`PersonManager` or `RoleManager` is unavailable, so a degraded init silently demotes every user
rather than failing loudly.

### What is wrong

- __1 The thing that decides is not the thing named after deciding.__ `PolicyEvaluator` decides;
  `PolicyManager` is a catalogue that decides nothing; `ACLManager` decides page access with its own
  copy of the policy read.
- __2 One subject, six components.__ Nobody can say which one owns the question, which is why
  `ACLManager` grew to 1,446 lines and `PolicyManager` stalled at 129.
- __3 `ACLManager` holds things that are not access control.__ Maintenance mode, business hours,
  holidays and time restrictions answer "is the site open", not "may this identity do this".
- __4 The role catalogue is copied into data.__ `getOrCreateRoleRecord` snapshots `roleName`,
  `description`, `issystem`, `icon`, `color` and __`permissions`__ from
  `ngdpbase.roles.definitions[name]` into each record, and its docstring states that later catalogue
  edits do not propagate. Per-record overrides are "first-class", which is a second grant path
  outside the policies, in a data file, invisible to the admin matrix and to the registry checks.
  __Nothing reads that snapshot__ — `resolveUserRoles` takes only `namedPosition` — and nothing
  exports it.

  __The drift is not hypothetical.__ Measured on jimstest, 2026-09-20:

  | role | permissions in the record | granted by policy | missing from the record |
  | --- | --- | --- | --- |
  | `admin` | 17 | 21 | `admin-read`, `asset-edit`, `share-manage`, `token-mint` |
  | `editor` | 10 | 12 | `share-manage`, `token-mint` |
  | `contributor` | 7 | 7 | — |
  | `reader` | 4 | 4 | — |

  Two of the four live records are behind the policies, by four entries and two. Nothing reports
  it, and nothing would.
- __5 The catalogue is duplicated inside the config too.__ Each role's inline `permissions[]` array
  is display-only; the policies enforce. `_comment_roles` (#713) asks for the two to be kept matched
  by hand. All eight roles agree today (verified 2026-09-20), enforced by nothing.
- __6 Roles used at runtime are absent from the catalogue__ — `All`, `Authenticated`, `occupant` —
  tracked as [#1429](https://github.com/jwilleke/ngdpbase/issues/1429) (P0).

### The model — PEP, PDP, PIP, PAP

Operator, 2026-09-20: use the standard access-control roles. They are already
present in this codebase; they are just not named, which is why "who decides"
had no answer.

| Role | What it does | Who, once Subject 1 lands |
| --- | --- | --- |
| __PEP__ — enforcement point | Asks, then enforces the answer: 401 vs 403, a redirect, a 503. __Never decides.__ | Route handlers (`permitted`, `ctx.requirePermission`), __manager doors__ (authorization happens at the door with an `ActorContext`), and the availability gate middleware |
| __PDP__ — decision point | Answers "may this subject do this action, on this resource". One implementation, one ordering, one place the agent-token and share ceilings run | `PolicyDecisionPoint` — today's `PolicyEvaluator` matching, plus the ceilings that currently sit in `UserManager.hasPermission` |
| __PIP__ — information point | Supplies the attributes a decision needs. Decides nothing | `PolicyInformationPoint` for a page's own rules (ACL markup, audience, private flag) — today's `ACLManager`; `UserManager` / `RoleManager` for the subject's roles |
| __PAP__ — administration point | Where policy is authored and changed | `ConfigurationManager` (the merge, and the write path for `app-custom-config.json`) together with the admin screens — which is where [#1216](https://github.com/jwilleke/ngdpbase/issues/1216) belongs |

__One question shape.__ `decide(caller, { action, resource? })` returning
`{ permit, reason }`. A capability check is a decision with no resource; a page
check is one with `{ type: 'page', id }`. `hasPermission` and `canAccess`
remain the PEP-side wrappers, and both call it.

__One vocabulary.__ Every action name is declared in
`ngdpbase.permissions.definitions` and nowhere else. The page actions
(`view`, `edit`) map onto the registry names (`page-read`, `page-edit`), and
the colon-separated names in `ACLManager.checkDefaultPermission`
([#1174](https://github.com/jwilleke/ngdpbase/issues/1174)), which are declared
nowhere and can therefore only deny, go.

__The vocabulary becomes a type.__ A build step reads the registry and emits a
union, so a mistyped permission is a compile error rather than a silent deny.
Addons generate their own union from their own `config/default-config.json`, so
the guarantee holds per package rather than being weakened to `string` for
everyone.

__Availability stays a separate PEP at the edge__, not environment attributes
inside the PDP: it must answer before any resource is resolved, and it covers
static assets that never reach a decision ([#1432](https://github.com/jwilleke/ngdpbase/issues/1432)).

### Target ownership

| Fact | Owner |
| --- | --- |
| Which permissions exist | `ngdpbase.permissions.definitions`, through `ConfigurationManager` |
| Which roles exist | `ngdpbase.roles.definitions`, through `ConfigurationManager` |
| What a role permits | `ngdpbase.access.policies`, through `ConfigurationManager` — the only grant path |
| Which person holds which role | `RoleManager` records (`data/roles/*.json`) |
| A page's own rules (ACL markup, audience, private) | the page, read at evaluation time |
| __May this identity open this door__ | __one gatekeeper__, deriving from the above every time |

### Plan

Each step is shippable alone and leaves the tree green.

- 1 __Delete the snapshot.__ ✅ [3ec3511b](https://github.com/jwilleke/ngdpbase/commit/3ec3511b) — a role record holds membership only.
- 2 __Derive the role × permission matrix.__ ✅ [56d4fd1f](https://github.com/jwilleke/ngdpbase/commit/56d4fd1f) — computed from the policies; the inline `permissions[]` arrays are gone, and with them #713's hand-sync rule.
- 3 __Move availability out of `ACLManager`.__ ✅ [1519af44](https://github.com/jwilleke/ngdpbase/commit/1519af44) — one gate, several reasons, each with its own message ([#1432](https://github.com/jwilleke/ngdpbase/issues/1432)). `ACLManager` 1,446 → 1,079 lines.
- 4 __One policy read.__ ✅ [62fc4b1d](https://github.com/jwilleke/ngdpbase/commit/62fc4b1d) — `ACLManager` kept a policy cache that was written and never read; deleted. `PolicyEvaluator` asks `PolicyManager`, which is the one read.
- 5 __One vocabulary, and make it a type.__ Map the page actions onto the registry names, delete the colon names (#1174), and generate the union from the registry.
- 6 __Introduce the PDP.__ `PolicyDecisionPoint` wraps today's matching and takes over the ceilings; `UserManager.hasPermission` delegates to it. Behaviour identical — one decider exists.
- 7 __Page decisions delegate.__ `ACLManager` supplies the page's attributes and asks the PDP instead of deciding. __Write down what each of its five entry points orders today before changing any of them__ — that ordering is the risk in this whole plan, not the plumbing.
- 8 __`ACLManager` becomes the PIP__ in name and location; the ACL markup parsing moves to `src/parsers/`.
- 9 __PAP:__ policy create/update/delete write config through `ConfigurationManager` with an `ActorContext` and an audit record ([#1216](https://github.com/jwilleke/ngdpbase/issues/1216)).
- 10 __Retire `PolicyManager`__ once the PDP reads the policies and the PAP writes them.

### Open decisions

- __Step 7's orderings.__ `ACLManager`'s five entry points each sequence ACL
  markup, audience and policy their own way. Which ordering is correct is a
  decision, not a refactor.
- __Whether `UserManager` keeps the two catalogues.__ It owns the permission
  catalogue, the role catalogue, subject construction and membership sync.
  Some of that is PIP work; splitting it is larger than the steps above.

### Settled

- __Names:__ `PolicyDecisionPoint`, `PolicyInformationPoint` (operator, 2026-09-20).
- __PEPs are the doors__, not a layer: routes, manager doors, the availability gate.
- __PAP is `ConfigurationManager` plus the admin screens__, not a manager with its own store.
- __Availability is a separate PEP__, not PDP environment attributes.
- __Admin bypass:__ maintenance keeps its own `allow-admins`; a schedule or holiday never locks out an administrator, because there is no switch to flip from outside.
