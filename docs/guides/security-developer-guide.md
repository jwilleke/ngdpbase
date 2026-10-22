---
name: Security developer guide
description: How to write a route, manager method or addon that authorizes correctly — context forwarded, allow and deny from hasPermission or canAccess, permissions and policies as configuration, and the checks that fail
dateModified: 2026-10-22
category: guides
relatedModules: [UserManager, PolicyEvaluator, PolicyInformationPoint, WikiContext, ApiContext]
---

# Security developer guide

What a developer has to do so that a new route, manager method or addon authorizes the way this codebase requires. The principles are P1 and P2 in [security-posture.md](../security-posture.md); this page is the practice.

## Two questions, two doors

| Question | Ask | What it knows |
| --- | --- | --- |
| May this subject perform this kind of action at all? | `wikiContext.hasPermission('page-delete')` / `ctx.requirePermission('admin-system')` | The subject, the action, the policies, deny policies, an inactive account, the agent-token scope ceiling |
| May they do it on this page? | `wikiContext.canAccess('edit', pageName)` | All of the above plus the page's own access markup, audience and private flags, and ACL frontmatter. Resource attributes beat global policy |
| May they read this page — its content, its history? | Nothing: read it through the page door, `pageManager.readPage(id, ctx)` or `readVersionHistory` / `readVersion` / `readVersionDiff` | The door decides `page-read` itself before it reads anything, and answers a refusal instead of the page. A route answers a refusal with 404. `npm run lint:page-door` fails a route that reads past it ([#1622](https://github.com/jwilleke/ngdpbase/issues/1622)); the methods are in [PageManager.md](../managers/PageManager.md) |
| Does the subject hold the permission, to show a control? | `wikiContext.holdsPermission('config-manage')` / `pdp.holds(subject, action)` | Policy alone, without the step-up freshness rule ([#1635](https://github.com/jwilleke/ngdpbase/issues/1635)). For affordances only — acting on the control asks `hasPermission`, which applies step-up. A door never asks this. |
| Would the page door allow it, to show a control or a block for a page — the Edit button, `<wiki:If hasPermission:edit>`? | `policyInformationPoint.pageAffordance(wikiContext, 'edit')`, or `wikiContext.mayShow('edit')` from a context (`<wiki:If test="hasPermission:x">`); for another page, `pageAffordanceFor(subject, pageName, 'edit')` (the journal entry view's Edit link), or `pageManager.mayShowPage(id, ctx)` for whether a reader may see a page at all (`<wiki:If test="exists:Page">`) | The page door's own evaluator, so it agrees with `canAccess` / `checkPagePermissionWithContext` / `canUserAccessPage` on allow and deny. Records nothing — no `authorization-deny`, no info log line ([#1668](https://github.com/jwilleke/ngdpbase/issues/1668)). For affordances only; acting on the control (`GET /edit`, `POST /save`) asks the door. A door never asks this. |
| May they do this kind of action to this page — create it, write it? | `wikiContext.hasPermissionOn('page-create', pageName)` | The capability, asked about the page itself. For a vault page: the owner only (the container rule), then the capability with the page's `vault`, so `vault-owner` decides and a site-wide role does not reach in ([#1539](https://github.com/jwilleke/ngdpbase/issues/1539)). A route that writes an existing page also asks the page door (`WikiRoutes.writeRefusal`), as the editor does ([#1542](https://github.com/jwilleke/ngdpbase/issues/1542)) |

Nothing else is an allow or a deny:

- `isAuthenticated` classifies a refusal, 401 for an anonymous subject and 403 for an authenticated one, after policy has refused. It never decides.
- A refusal is shaped in one place, `ApiContext.enforceDeny(permission, decision)` ([#1431](https://github.com/jwilleke/ngdpbase/issues/1431)): 401 or 403 as above, and for a step-up deny (`reason` `STEP_UP_REASON`, the one reason a PEP may read) the `reauth` answer from `AuthManager.askForFreshSignIn`, which records the prompt and never offers a delegated credential a `reauth`. `requirePermission` refuses through it; a manager that asks `pdp.decide` itself hands a deny to it. Never build the refusal yourself. It also records the refusal as `authorization-deny`, so every refused attempt is audited whatever the caller does (decided 2026-10-17, [#1825](https://github.com/jwilleke/ngdpbase/issues/1825); not built yet — see the audit guide's Known gaps).
- `RoleManager.hasRole` is a lookup about a named account, the same shape as `PolicyDecisionPoint.userHoldsPermission`. It is never this request's authority: a role name skips the policy evaluator, deny policies and the token ceiling. `ApiContext.requireRole` is gone for that reason. `UserManager` has no `hasRole`.
- Who holds a permission, such as the administrators a notice goes to, is `PolicyDecisionPoint.usersHolding(action)` (`'admin-system'`), each account asked through `userHoldsPermission`; never a list of role names. Null means there is no UserManager to ask; treat it, and an empty list, as nobody to tell, and log only, since an empty `targetUsers` means every user ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)).
- A proxy ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) is a subject carrying `viaProxy`: the person represented in `username` and `roles`, the actor and grant in the claim. Forward it like `viaToken`; never decide on `ctx.username === owner` without `mayActInPrivateContainer`, because a proxy's username is the owner's. A proxy reaches the owner's encrypted vaults only through `dekFor` / `unlockedStoreIdsFor`, from the key copy the owner sealed to the proxy (slice 5); never hand a proxy subject `kekFor`, a `privateStoreHandle` or the owner's key bag, and never log or record a key, a copy or a person's private key. The ceiling is the PDP's (grant ∩ the person represented ∩ the actor, re-read live), and a check that a subject is delegated before asking it is `carriesCeiling`, which includes the proxy. A record of what a proxy did names both people: build its "who" with `actorOf(ctx)` (or forward `viaProxy` to a content builder), never `user: ctx.username`, which would record the person represented as having done it (`npm run lint:audit-attribution`). Never build a proxy subject anywhere but `AuthManager.subjectActingFor`, which the session middleware calls on every request with the live grant; a route that needs the signed-in person rather than the subject reads `viaProxy.actor`. A door that takes a caller for a decision takes the subject, never its username: under a proxy the username is the person represented, and `userHoldsPermission(username, …)` would decide with their roles unbounded (the audit queries take the subject for this reason). A credential made under a proxy grant (an agent token, an approved device) belongs to the person represented, records the proxy and the grant (`approvedBy`, `proxyGrantId`), is checked against the live grant at every use, and is revoked when the grant ends (slice 6); never mint or approve one for a proxy subject without asking the PDP with that subject, which bounds it by the grant and by both people.
- A role name in code, `roles.includes('admin')`, is the same defect when it is the allow. The static test `src/routes/__tests__/WikiRoutes.permissionGates.test.ts` keeps `hasRole(` out of `src/routes/WikiRoutes.ts`. The one `updates.roles.includes('admin')` there validates submitted form data (an external account cannot be given the admin role); it is not an authorization decision.

## A door records, an affordance does not

A door is a check made before the action is performed or the content is served on its answer. Every door decision is written to the application log, and a refusal becomes an `authorization-deny` audit record with the subject's `user` and the request's `ipAddress`. An allow is not an audit record of its own: the enforcement point records the action it then carries out ([Who records what](audit-developer-guide.md#who-records-what)). An affordance only decides whether to show a button, link or menu item; it is not an attempt, so it is never recorded. Asking a door to decide an affordance writes a denial for every visitor who cannot act — the view's Edit button did this for every anonymous view until [#1668](https://github.com/jwilleke/ngdpbase/issues/1668). Page markup that hides a block is an affordance too: `<wiki:If test="hasPermission:edit">` asks `mayShow`, and `<wiki:If test="exists:Page">` asks `mayShowPage`, so a hidden block writes nothing. `<wiki:Include>` serves the other page's content, so it reads through the door (`readPage`) and a refusal is recorded; `resaveForKeywordChange` writes a page, so it asks `canAccess`. When it is unclear which a call is, it is a door.

## Every page a person is shown goes through the page-list door

A page that reaches a person in a list, a search hit, a count, a suggestion, a feed or a plugin's output is decided by `PolicyInformationPoint`, the decision `/view` makes, never by the index it came from. Two doors, one evaluator:

- `pageManager.listPagesFor(subject, action)` when the list is "every page this reader may see";
- `pageManager.filterPagesFor(subject, names, action)` when something else found the names — a search index, a keyword lookup, a category query ([#1962](https://github.com/jwilleke/ngdpbase/issues/1962)).

Rules:

- An index decides nothing. The search index, Elasticsearch and the page index know words and metadata, not who may read them; their own private-page checks may narrow, never decide.
- Decide before you limit. Filter, then count, slice and page, so a total, `hasMore` or a page number never counts a hidden page. `SearchManager` over-fetches for this, bounded by `ngdpbase.search.access-filter.max-candidates`.
- Batch, never one door call per row: both doors decide a whole list against policy compiled once, with no log line or audit record per page.
- Search through `searchWithContext` / `advancedSearchWithContext` with the request's context, never `search` / `advancedSearch`, which know no reader. A plugin passes its render context; its output is cached per viewer.
- No door means nothing listed: without `PolicyInformationPoint` both doors return nothing, never the unfiltered list.

## Every security-relevant call carries a context

A manager method that decides access, writes an audit record, or acts on someone's behalf takes the context it was given, positionally. Forward it; never rebuild `{ username, roles, isAuthenticated }` from parts, because the rebuild drops `viaToken` and with it the agent-token scope ceiling. `scripts/check-permission-subject.ts` fails the commit on a rebuild in route code. A job or timer uses `JobContext`; boot paths that act use the system principal. An omitted actor is not "the system"; it is nobody, and the record is wrong.

## A closed account holds nothing

An account deleted or turned off loses every way in at once, through `AuthManager.closeAccess` ([#1765](https://github.com/jwilleke/ngdpbase/issues/1765)): its sessions in the live session store, and, on delete, its tokens, app grants, shares, proxy grants and credentials. A session is also held to its account on every request, so one the close missed, or one whose username a new account took, is refused ([#1937](https://github.com/jwilleke/ngdpbase/issues/1937)). The rules are in [authentication-developer-guide.md](authentication-developer-guide.md#standing-rules). A new kind of access an account can hold is closed there, and anything that names an account only by its username must not outlive it: a new account can take the name.

## Permissions and policies are configuration

- `ngdpbase.permissions.definitions` is the permission catalog: `{target}-{action}`, target first, hyphen separated. Callers read it live with `ConfigurationManager.getProperty('ngdpbase.permissions.definitions')`; there is no list in code. `UserManager` does not hold the catalog. Each grantable entry carries a `label`, the plain words a person reads; `description` is for administrators and developers. `permissionLabel` / `describeScopes` in `src/utils/permissionCatalog.ts` are the one lookup, and `AuthManager.describeScopes` reads it against the live catalog (#1764).
- `ngdpbase.access.policies` grants permissions to subjects. `hasPermission` resolves through `PolicyEvaluator` over these; a permission that appears in a policy is honoured whether or not anything else names it.
- Roles are lists in `ngdpbase.roles.definitions`, additive, unordered, never gating anything. A role change is a configuration change and is recorded as `config-change`.

__Adding a permission for a new action:__ declare it in the catalog with description, icon and colour; grant it in a policy; ask for it at the door. A catalog entry that only declares an audit event is `"grantable": false` and is never granted ([audit-developer-guide.md](audit-developer-guide.md)). The registry-drift test fails when a permission is declared and checked nowhere, or checked and declared nowhere.

## Secrets in configuration

A secret in configuration is a `$NAME` reference to an environment variable, at the top level of a key or anywhere inside a map or list, and it is declared `secret` in `ngdpbase.config.sensitive-values`, by key or by a path with `*` for a map key ([#1889](https://github.com/jwilleke/ngdpbase/issues/1889)). The rules, and every place a value is shown and so hidden, are in [configuration-developer-guide.md](configuration-developer-guide.md#standing-rules). Two that bind code:

- Show, log or record a configuration value only through `utils/sensitiveValues.ts` (`shownValue` for a viewer; `hideDeclaredPaths` with `NO_SECRETS` for an admin screen, a log line or an audit record). A new screen or record that renders a value with neither leaks what a path entry names.
- `getUnresolvedProperty` returns the reference, not the secret. Use it only to check that a secret is a reference; a literal secret comes back as itself.

## Addons

An addon's `config/default-config.json` is a layer of the configuration merge, between the shipped defaults and the operator's custom file, folded in when `ngdpbase.addons.<slug>.enabled` is true. The author's copy of the recipe — declare a permission, grant it in a policy with its own `id`, check it with `hasPermission` / `canAccess` — is [Permissions](addons-developer-guide.md#permissions). The file, the merge, and where the operator overrides it are [Configuration](addons-developer-guide.md#configuration). Do not append to a role's `permissions` array from an addon: a plain array replaces wholesale on merge; a policy with its own `id` merges by id. An addon never names a role. Bundled and external addons are treated alike; discovery follows `ngdpbase.managers.addons-manager.addons-path`.

## Checklist for a new route or manager method

- 1 The handler asks `hasPermission` or `canAccess` for the permission the action *is*. If no permission means that, add one to the catalog; do not borrow a role name.
- 2 The context is forwarded, not rebuilt. Addon API routes use `ApiContext.from(req, engine)`.
- 3 The refusal answers 401 or 403 by `isAuthenticated`, after policy.
- 4 The action's audit event exists, is declared on its permission entry's `audit` block in `ngdpbase.permissions.definitions` ([#1638](https://github.com/jwilleke/ngdpbase/issues/1638)), and is emitted at the manager door — see [audit-developer-guide.md](audit-developer-guide.md).
- 5 Tests: refused by policy, allowed by policy with the subject's role name saying otherwise, and the audit record written. Sabotage each once.

## How you know you are done

- `npm run lint:permission-subject`
- `npm run lint:page-door`
- `npm run lint:http`
- `npm run lint:csrf`
- `npm run lint:addons`
- `npm run check:addon-load`
- `npm test -- src/__tests__/permission-registry.invariant.test.ts src/routes/__tests__/WikiRoutes.permissionGates.test.ts`

The `lint:*` commands above run in `lint`, `lint:ci` and the pre-commit hook. `npm run check:addon-load` does not; run it after a build when an add-on import changes. The permission tests are `npm test`.

## See also

- [security-posture.md](../security-posture.md) — P1, P2, numbered decisions
- [authentication-developer-guide.md](authentication-developer-guide.md) — sign-in, levels, step-up
- [audit-developer-guide.md](audit-developer-guide.md)
- [configuration-developer-guide.md](configuration-developer-guide.md)
- `src/context/ActorContext.ts`, `src/utils/subjectMayDo.ts`

## Known gaps

- [#1762](https://github.com/jwilleke/ngdpbase/issues/1762) — proxy access is complete (slices 1–7), reachable while `ngdpbase.auth.proxy-access.enabled` is on. The private-store risk (a proxy's username matching the owner's) is closed, and the audit queries take the subject. Left: the "Jim acted for you" entries wait for the sign-in history page ([#1766](https://github.com/jwilleke/ngdpbase/issues/1766)); after a proxy approves a device, the browser's provider session stays signed in as the person represented, so the proxy's own app sign-in is refused (fails closed) until that session ends.
- [#1937](https://github.com/jwilleke/ngdpbase/issues/1937) — what a closed account's sessions still cannot be checked against (old sessions with no sign-in time, stores that cannot list by id) is in the authentication guide's Known gaps.
- [#1962](https://github.com/jwilleke/ngdpbase/issues/1962) — page surfaces not yet through the page-list door: the keyword and category catalogs on the `/search` page and in the editor (`SearchManager.getAllUserKeywords` / `getAllSystemKeywords` / `getAllCategories`) name keywords of pages the reader cannot open; the journal marquee's public-entry count (`JournalDataManager.publicCount`) counts them; a keyword share album's pages are chosen by `searchByUserKeywords` and its own exclusion list (`ShareManager.isPageExcluded`: private, audience, access), a second copy of part of the rule that does not see a policy such as a system-category deny. `SearchManager.getSuggestions` and `WikiRoutes.searchSuggestions` filter nothing but are not routed.
