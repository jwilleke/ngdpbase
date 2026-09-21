---
name: Manager source-of-truth plans
description: "Where each fact lives and which manager owns it — the standing rule, the current violations, and the plan to fix them. Starts with the access-control subject"
dateModified: '2026-09-21'
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

__Status:__ analysed 2026-09-20; __all ten steps shipped__ (2026-09-21). Tracked by
epic [#1431](https://github.com/jwilleke/ngdpbase/issues/1431).

__"What the code does today" below is the record of what was found on 2026-09-20__, kept as the
evidence the plan was built from. Several of its rows have since been fixed — `ACLManager` is ~900
lines rather than 1,446, `checkDefaultPermission` and `performStandardACLCheck` are gone
([#1174](https://github.com/jwilleke/ngdpbase/issues/1174)), the availability checks moved out
([#1432](https://github.com/jwilleke/ngdpbase/issues/1432)), and the policy re-read went with the
cache. Read it as history; the Plan section carries the current state.

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
| __PIP__ — information point | Supplies the attributes a decision needs. Decides nothing | `PolicyInformationPoint` — the one PIP (operator, 2026-09-21): a page's own rules (audience, private flag) and the subject's attributes, asking `RoleManager` for membership |
| __PAP__ — administration point | Where policy is authored and changed | `ConfigurationManager` (the merge, and the write path for `app-custom-config.json`) together with the admin screens — which is where [#1216](https://github.com/jwilleke/ngdpbase/issues/1216) belongs |

__One question shape.__ `decide(caller, { action, resource? })` returning
`{ permit, reason }`. A capability check is a decision with no resource; a page
check is one with `{ type: 'page', id }`. The context's `hasPermission` and
`canAccess` are the PEP-side doors, and both end at it. They stay two
(operator, 2026-09-21): a capability and a page are different questions, and
one door with an optional page would turn a forgotten page into a silent
global answer. `UserManager.hasPermission` is gone — one door, one decider.

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
  - 7a __Tier 3 deleted.__ ✅ — the markup is read by nothing; `parsePageACL` and the tier are gone, and the four tests that asserted it are kept inverted. Conversion to audience terms moves to the NCM funnel ([#1446](https://github.com/jwilleke/ngdpbase/issues/1446), blocking [#1339](https://github.com/jwilleke/ngdpbase/issues/1339)); stored pages ride along with [#1347](https://github.com/jwilleke/ngdpbase/issues/1347). One sequence now, not two.
  - 7b __The author-lock admin bypass__ is still a role-name gate. __Decided (operator, 2026-09-21): it becomes the `admin-system` permission__ — the existing operator override, already granted to `admin` by `admin-full-access`, so no config change. ✅ Done in both implementations; `ACLManager` holds no role-name gate at all now, so its `check-permission-gates.ts` allowlist entry is removed and a new one there fails CI.
  - 7d __Missing metadata.__ ✅ — the decider refuses (`no_page_metadata`) unless the action is `create`; the view and edit routes, which have just proven the page exists, fail loudly with a 500, an error log and an `admin-system`-holder notification, de-duplicated per page (`utils/pageMetadataMissing.ts`). The rule surfaced a real disclosure: `<wiki:Include>` handed the decider `pageMetadata: null`, so the included page's audience was never consulted and an audience-restricted page rendered for any reader global policy allowed. It now asks `canUserAccessPage`, and fails closed without an `ACLManager` (it used to allow).
  - 7c __One implementation__ of the tier sequence. ✅ — `walkPageTiers` decides tiers 0 → 2 for one page and logs nothing; `_runEvaluator` and `filterAccessiblePages` both call it, supplying only what each can afford (per-page PDP and an audit record per decision, against compiled policy and none). The order now lives in one place. __Step 7 is complete.__
- 8 __`ACLManager` becomes the PIP__ in name and location; the ACL markup parsing moves to `src/parsers/`. ✅ — `PolicyInformationPoint`, registered under that name, in `src/security/` beside the PDP. Renamed everywhere at once (operator): no addon source and nothing in the addon template referred to it, and the name was persisted nowhere — no config key, no audit field. The markup scrubber is `stripAclMarkup` in `src/parsers/aclMarkup.ts`, and now keeps escaped examples (`[[{ALLOW …}]`): editing a page that documented the syntax used to strip the example to a stray `[`. `ACLManager.md` and its complete guide are tombstones pointing at `PolicyInformationPoint.md`; their content described markup, availability and role checks the component no longer has. Steps 1–10 done.
- 9 __PAP:__ policy create/update/delete write config through `ConfigurationManager` with an `ActorContext` and an audit record ([#1216](https://github.com/jwilleke/ngdpbase/issues/1216)). ✅ — __the write already existed__: `/admin/configuration` writes `ngdpbase.access.policies` through `ConfigurationManager.setProperty(key, value, actor)`, which records the change (#1150). __But it was not enforced until a restart__ — `PolicyManager` snapshotted the policies at boot and nothing re-read them. Step 10 fixes that. The dedicated `/admin/policies` editor was dead three ways — unrouted (a 404), unlinked, and its save path called `PolicyManager` methods that do not exist — and is deleted (operator, 2026-09-21). `/admin/roles` keeps the read-only __Security Policy Summary__, derived from the policies; its title and intro were corrected, having claimed permissions were set there and that page ACLs restrict but cannot grant. The page is now wholly read-only (operator, 2026-09-21): its Save, Delete and create buttons called `UserManager` methods that only threw, so Save was a 500; they are removed with their routes and methods, and roles are edited in Configuration (`ngdpbase.roles.definitions`).
- 10 __Retire `PolicyManager`__ once the PDP reads the policies and the PAP writes them. ✅ — `readPolicies(get)` (`src/security/policies.ts`) reads `ngdpbase.access.policies` through `ConfigurationManager` at decision time and keeps nothing, with `PolicyManager`'s answer kept exactly (enabled switch, non-policies skipped, later duplicate id wins, highest priority first). `PolicyManager` snapshotted the policies at boot, so a policy changed in `/admin/configuration` was saved and audited but __not enforced until a restart__ — the snapshot this file's rule names as its example. Two more copies went with it: `UserManager` derived a user's permissions itself, ignoring deny policies, and could disagree with the admin summary (now `permissionsForRoles`, the summary's own derivation); and `PolicyValidator.validateAllPolicies()` called a `getPolicies()` that never existed.

Operator, 2026-09-21: __UserManager is split along the Target ownership table__ — each fact goes to the owner this file already names. UserManager keeps accounts and sessions (provider, password hashing, users, external users, sessions, backup). No wrapper or helper is added in front of a declaration: a caller reads it with `configManager.getProperty`, because a helper is a second door to a fact `ConfigurationManager` already serves.

- 11 __The catalogues.__ ✅ `getRoles` / `getRole` / `getPermissions` and the `roles` / `permissions` getters leave `UserManager`; each caller reads `ngdpbase.roles.definitions` or `ngdpbase.permissions.definitions` through `ConfigurationManager.getProperty`.
- 12 __Membership to `RoleManager`.__ ✅ `hasRole`, `assignRole`, `removeRole`, `resolveUserRoles` and the role-record sync move to the owner of `data/roles/*.json`.
- 13 __Subject construction to the PIP.__ ✅ `resolveSubjectNow`, `systemSubject`, `getAnonymousUser` and `getCurrentUser` supply the subject's attributes to a decision.
- 14 __Decisions to the PDP.__ `hasPermission`, `getUserPermissions` and `userHoldsPermission` are PDP questions. 14a ✅ — `UserManager.hasPermission` is removed, not kept as a wrapper (operator): the PDP's `permits(subject, action)` is the boolean form of `decide`, and the contexts, managers and routes ask it; `getUserPermissions` and `userHoldsPermission` are the PDP's. `requirePermissions` and `ensureAuthenticated`, which had no caller, are deleted (operator). The PDP starts before `UserManager`, next to the PIP. 14b: __Only the PDP interprets the policies__ (operator, 2026-09-21): `readPolicies` becomes part of `PolicyDecisionPoint`; the admin Security Policy Summary asks the PDP what a role permits; `PolicyValidator`, which checks stored entries, reads `ngdpbase.access.policies` through `getProperty`. `readPolicies`' duplicate-`id` rule goes — merging `id` arrays by id is the configuration merge's rule. The largest slice, because `hasPermission` is called throughout core and the addons, so it is last.

### Step 7's map — what each page decision orders today

Written down before anything moves, because this ordering IS the behaviour.

__`checkPagePermissionWithContext(wikiContext, action)`__ — the main page door:

| Tier | What | Outcome |
| --- | --- | --- |
| −1a | agent-token scope ceiling (#946) | deny if the token lacks the mapped permission |
| −1b | share ceiling (#1222) | deny unless the share delegates the action, is unexpired, COVERS THE RESOURCE (`shareCoversResource` over the page's keywords), and the issuer still holds the action |
| 0 | private page (`canAccessPrivateContainer`) | owner or delegate only |
| 0.5 | author-lock, `edit` only | a locked page's non-author falls through to Tier 1+ rather than being refused here |
| 1 | frontmatter `audience` / `access` | __overrides global policy__ — this is why the token ceiling must precede it |
| 2 | global policies via `PolicyEvaluator`; for a share, the share IS the policy | allow/deny |
| 3 | deprecated page-ACL markup | blocked on new saves, still read |
| — | default | deny |

__The capability door__ (`UserManager.hasPermission`, now the PDP) orders:
token ceiling → share (returns) → live role resolution → policies. The same
two ceilings, implemented separately, and the page one additionally checks
resource coverage — which is exactly what the PDP's `resource` parameter is
for.

__What this means for the step.__ The ceilings and Tier 2 belong to the PDP.
Tiers 0, 0.5, 1 and 3 are page ATTRIBUTES — private flag, author, audience,
markup — so they become PIP material the PDP consults in that order. The
sequence above is what the PDP must reproduce; anything else is a behaviour
change wearing a refactor's clothes.

__Other entry points to reconcile__: `evaluatePagePermission` (same tiers,
returns a reason), `canUserAccessPage` (cross-page check, loads the target's
metadata itself), `filterAccessiblePages` (runs the ceilings ONCE for the
subject, then per-page attributes), `canUserAccessMediaItem`.

### Step 7's orderings — measured, then decided (2026-09-21)

The premise needed re-checking before anything could be decided, and it had
moved. The five entry points are no longer five orderings:

| Entry point | Orders the tiers | Tier 3 reachable |
| --- | --- | --- |
| `checkPagePermissionWithContext` | `_runEvaluator` | yes — content is to hand |
| `evaluatePagePermission` | `_runEvaluator` | yes |
| `canUserAccessPage` | `_runEvaluator`, via a minimal context | __no__ — passes `content: null` |
| `canUserAccessMediaItem` | share ceiling, then `canUserAccessPage` | no |
| `filterAccessiblePages` | its own loop | __no__ — content is not indexed |

So there are __two__ implementations of the sequence, not five, and they agree
on tiers −1 through 2. __Every remaining divergence is Tier 3__, the deprecated
page-ACL markup: reachable only when the caller happens to hold page content.
A page whose sole grant is that markup opens when viewed directly, is absent
from every listing, and is refused by every cross-page check.

__What the markup is worth, measured on a 36,718-page instance:__

| Where the markup lives | Files | Read by Tier 3 |
| --- | --- | --- |
| `versions/` (history) | 46 | never |
| `private/` (sealed store) | 2 | no — Tier 0 decides first |
| live page content | __1__ | yes |

That one is [Jspwiki.properties](/view/Jspwiki-properties), an imported
documentation page, and the match is inside prose describing the syntax:
`[[{ALLOW edit Charlie}]`. `parsePageACL`'s regex finds the inner
`[{ALLOW edit Charlie}]` and dutifully grants `edit` to a principal named
Charlie. __A page that documents the feature acquires an ACL by doing so.__

It is also half-broken where it does match. Markup carries JSPWiki's
capitalised principals — `Admin`, `Trusted` — while this system's roles are
all lowercase (`admin`, `editor`, `reader`, …). Tier 3 matches roles by exact
string, so `[{ALLOW edit Admin}]` grants nothing. Only `All` and exact
usernames can still land.

__Decisions.__

- 1 __Tier 3 is deleted, not made consistent.__ Making it consistent means
  reading page content for every candidate in every listing — a disk read per
  page to revive a feature already blocked on new saves. Nothing on this
  instance depends on it. The ordering question dissolves with it: the two
  implementations then agree tier for tier.
- 2 __The deletion is gated on a migration check, not on this one instance.__
  `npm run check:page-acl` reports any page whose content carries the markup,
  so an operator can see before upgrading whether a page of theirs relies on
  it. One instance is evidence, not proof.
- 3 __One sequence, one implementation.__ With Tier 3 gone, `_runEvaluator`
  and `filterAccessiblePages` differ only in what they may cost: the filter
  compiles policy once and writes no audit record per page. The tier sequence
  is extracted so both call it, and a change cannot land in one and miss the
  other.
- 4 __The author-lock admin bypass is a defect, not a decision.__ Tiers 0.5 in
  both implementations read `roles.includes('admin')` — a role deciding
  access, which P2 forbids. `ACLManager`'s allowlist entry in
  `check-permission-gates.ts` reads "tier 0 private-page bypass and the filter
  that mirrors it", and Tier 0 does not use a role at all
  (`mayActInPrivateContainer` is owner-or-delegate). The gate is riding on an
  allowlist reason written for something else. It becomes a permission.
- 5 __Missing metadata denies loudly — except `create`__ (operator,
  2026-09-21). A page being created has no metadata yet, so policy decides
  and the subject must hold `page-create`. For every other action, an
  existing page without metadata is broken or unreadable: deny, and make it
  visible rather than an ordinary refusal: __a 500, an error-level log line,
  and an admin notification__, de-duplicated per page. "No metadata" only
  means damage when the page exists and this subject could otherwise read it
  — a page that does not exist stays a not-found, and a sealed page this
  session cannot unlock stays a refusal (#1422). The first wording here —
  "both deny" — would have blocked page creation.

### Open decisions

- *None.* The catalogue question is settled by steps 11–14.

### Settled

- __Names:__ `PolicyDecisionPoint`, `PolicyInformationPoint` (operator, 2026-09-20).
- __PEPs are the doors__, not a layer: routes, manager doors, the availability gate.
- __PAP is `ConfigurationManager` plus the admin screens__, not a manager with its own store.
- __Availability is a separate PEP__, not PDP environment attributes.
- __Admin bypass:__ maintenance keeps its own `allow-admins`; a schedule or holiday never locks out an administrator, because there is no switch to flip from outside.
