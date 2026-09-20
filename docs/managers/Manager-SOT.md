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
- So the `enabled` flag gates one reader and not the other.

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
- __5 The catalogue is duplicated inside the config too.__ Each role's inline `permissions[]` array
  is display-only; the policies enforce. `_comment_roles` (#713) asks for the two to be kept matched
  by hand. All eight roles agree today (verified 2026-09-20), enforced by nothing.
- __6 Roles used at runtime are absent from the catalogue__ — `All`, `Authenticated`, `occupant` —
  tracked as [#1429](https://github.com/jwilleke/ngdpbase/issues/1429) (P0).

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

- 1 __Delete the snapshot.__ Remove `permissions` from the role record, and the cosmetic fields
  unless the admin UI reads them (check first). Remove per-record overrides. Nothing reads them, so
  this is a deletion, not a migration. Existing files keep the extra keys harmlessly until rewritten.
- 2 __Derive the role × permission matrix.__ `ConfigAccessorPlugin` computes it from the policies;
  the inline `permissions[]` arrays are deleted. Removes #713's hand-sync rule rather than policing
  it.
- 3 __Move availability out of `ACLManager`__ — maintenance mode, business hours, holidays, time
  restrictions. They gate the site, not the identity. New home to be decided.
- 4 __One policy read.__ `ACLManager` asks `PolicyManager` instead of reading
  `ngdpbase.access.policies` itself.
- 5 __Name the gatekeeper__ and give it the question. Options were: `PolicyEvaluator` keeps
  deciding and the managers become its catalogue and its resource rules; or `PolicyManager` owns
  both the policies and the question, with `PolicyEvaluator` as its internals. __Open — see
  below.__
- 6 __Fold the resource rules in.__ `ACLManager`'s page-access logic moves behind the gatekeeper;
  ACL markup parsing is a parser concern. `ACLManager` then has nothing left of its own.
- 7 __`PolicyManager`'s missing admin methods__ ([#1216](https://github.com/jwilleke/ngdpbase/issues/1216))
  land on whatever step 5 names, not before — otherwise they are written twice.

### Open decisions

- __Step 5's name.__ One gatekeeper, and whether it is called `PolicyManager`, `AccessManager`, or
  something else. `ACLManager` is JSPWiki vocabulary for per-page markup, which is one input rather
  than the subject.
- __Step 3's destination.__ Where availability checks live once they leave `ACLManager`.
- __Whether `UserManager` keeps the two catalogues.__ It currently owns permissions, roles, subject
  construction and membership sync. Some of that belongs to the gatekeeper; splitting it is a
  larger change than steps 1–7 and is deliberately not planned here yet.

## Subject 2 — (next)

Nothing yet. Add a section when the next source-of-truth tangle is analysed.
