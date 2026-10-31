---
name: Security developer guide
description: How to write a route, manager method or addon that authorizes correctly — context forwarded, allow and deny from hasPermission or canAccess, permissions and policies as configuration, and the checks that fail
dateModified: 2026-10-31
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
- __About yourself, or about someone else.__ Only a user acts; a contact never does (terms as in the [glossary](../GLOSSARY.md#identities)). An action by a user on their own profile and records is checked against `profile-manage`, which every user holds; the same action on anyone else's is checked against that resource's own permission (`identity-read` / `identity-manage` for an identity record, `admin-system` for another's audit entries, `user-edit` for another's account). Built this way: `/profile`, an add-on's profile section, `AuditManager` (own entries), `AuthManager` (own credentials), and identity records (`requireRecordAccess` in `src/utils/contactAccess.ts`: `IdentityManager`'s lookups and `update`, and the role reads that go through them; operator, 2026-10-23, [#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). Never decide "self" from a role name; compare the context's username with the record's.
- `RoleManager.hasRole(ctx, username, roleName)` is a lookup about a named account, the same shape as `PolicyDecisionPoint.userHoldsPermission`, asked with the caller's context like every lookup ([#2018](https://github.com/jwilleke/ngdpbase/issues/2018)). It is never this request's authority: a role name skips the policy evaluator, deny policies and the token ceiling. `ApiContext.requireRole` is gone for that reason. `UserManager` has no `hasRole`.
- __A policy subject is a role, or a scheduled job.__ A decision matches `role` subjects and `{ "type": "job", "value": "<job id>" }` ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999)), the two in `SUBJECT_MATCHERS` (`src/managers/PolicyEvaluator.ts`); `PolicyValidator` accepts those two and refuses any other type (`authenticated`, `user` and the rest), which would match nobody and grant nothing. To grant every user, name the role every account is given (`ngdpbase.user.account-roles`, shipped `vault-owner`), as core's `signed-in-self-service` does; see the [add-ons guide](addons-developer-guide.md#permissions).
- Who holds a permission, such as the administrators a notice goes to, is `PolicyDecisionPoint.usersHolding(action)` (`'admin-system'`), each account asked through `userHoldsPermission`; never a list of role names. Null means there is no UserManager to ask; treat it, and an empty list, as nobody to tell, and log only, since an empty `targetUsers` means every user ([#1813](https://github.com/jwilleke/ngdpbase/issues/1813)). A notice for administrators is never built by hand: call `NotificationManager.notifyAdmins({ level, title, message })`, which asks `usersHolding('admin-system')`, sets the `system` type and `targetUsers`, and, with nobody to tell, creates nothing and logs only ([#2040](https://github.com/jwilleke/ngdpbase/issues/2040)). A test (`NotificationManager.adminNoticesGuard.test.ts`) fails when any source file creates a `type: 'system'` notification with no `targetUsers`.
- __Who may decide a request for review is a permission__ ([#2072](https://github.com/jwilleke/ngdpbase/issues/2072)). A request names its `decidePermission`; `ReviewManager` lists a request only to a caller the PDP permits it to (`permits`), decides with `pdp.decide` (so step-up applies), notifies `usersHolding(decidePermission)`, and runs the add-on's handler with the decider's context, never a system context. Filing asks no permission (only add-on code reaches it, for a handler it registered under its own slug); a route that lets users file asks its own permission first, as forms asks `form-submit`. A refusal is `ReviewRefusedError` with the decision; `/reviews` answers it as any page route does ([ReviewManager](../managers/ReviewManager.md)).
- __The Executive Hub is a permission too__ ([#2093](https://github.com/jwilleke/ngdpbase/issues/2093)). `/executive` asks `executive-read`, which the shipped `executive-permissions` policy delegates to the `executive` role alone. Its shipped policies delegate reading what the organization keeps (pages, files, media, accounts and identity records, every shared folder) and `shared-folder-file` on `shared/executive` alone, so its holders add, edit and delete in the Executive shared folder and write nothing else ([Roles, permissions and policies](#roles-permissions-and-policies)). Its one other action, deciding requests for the board, comes from the decide permissions add-ons grant to `executive` in their own policies, decided by `ReviewManager` as above. An add-on's hub card names its own read permission and is shown only to a viewer the PDP permits it (`AddonsManager.executiveCardsFor`). A user's own vaults stay closed to the role by the vault container rule, not by anything the hub does.
- A proxy ([#1762](https://github.com/jwilleke/ngdpbase/issues/1762)) is a subject carrying `viaProxy`: the user represented in `username` and `roles`, the actor and grant in the claim. Forward it like `viaToken`; never decide on `ctx.username === owner` without `mayActInPrivateContainer`, because a proxy's username is the owner's. A proxy reaches the owner's encrypted vaults only through `dekFor` / `unlockedStoreIdsFor`, from the key copy the owner sealed to the proxy (slice 5); never hand a proxy subject `kekFor`, a `privateStoreHandle` or the owner's key bag, and never log or record a key, a copy or a user's private key. A job carries no key of any kind: a job enqueued under a proxy keeps the claim (the actor, the grant, its scopes) but never its `keyHandle`. `jobContextFromRequest` drops it, `BackgroundJobManager` strips it from every context it stores or hands a job (`withoutKeyHandle`), so no run record holds one, and `copyFor` refuses a job context; encrypted-store work for a proxy happens in the request ([#2047](https://github.com/jwilleke/ngdpbase/issues/2047)). The ceiling is the PDP's (grant ∩ the user represented ∩ the actor, re-read live), and a check that a subject is delegated before asking it is `carriesCeiling`, which includes the proxy. A record of what a proxy did names both users: build its "who" with `actorOf(ctx)` (or forward `viaProxy` to a content builder), never `user: ctx.username`, which would record the user represented as having done it (`npm run lint:audit-attribution`). Never build a proxy subject anywhere but `AuthManager.subjectActingFor`, which the session middleware calls on every request with the live grant; a route that needs the signed-in user rather than the subject reads `viaProxy.actor`. A door that takes a caller for a decision takes the subject, never its username: under a proxy the username is the user represented, and `userHoldsPermission(username, …)` would decide with their roles unbounded (the audit queries take the subject for this reason). A credential made under a proxy grant (an agent token, an approved device) belongs to the user represented, records the proxy and the grant (`approvedBy`, `proxyGrantId`), is checked against the live grant at every use, and is revoked when the grant ends (slice 6); never mint or approve one for a proxy subject without asking the PDP with that subject, which bounds it by the grant and by both users.
- A role name in code, `roles.includes('admin')`, is the same defect when it is the allow. The static test `src/routes/__tests__/WikiRoutes.permissionGates.test.ts` keeps `hasRole(` out of `src/routes/WikiRoutes.ts`. The one `updates.roles.includes('admin')` there validates submitted form data (an external account cannot be given the admin role); it is not an authorization decision.

## A door records, an affordance does not

A door is a check made before the action is performed or the content is served on its answer. Every door decision is written to the application log, and a refusal becomes an `authorization-deny` audit record with the subject's `user` and the request's `ipAddress`. An allow is not an audit record of its own: the enforcement point records the action it then carries out ([Who records what](audit-developer-guide.md#who-records-what)). An affordance only decides whether to show a button, link or menu item; it is not an attempt, so it is never recorded. Asking a door to decide an affordance writes a denial for every visitor who cannot act — the view's Edit button did this for every anonymous view until [#1668](https://github.com/jwilleke/ngdpbase/issues/1668). Page markup that hides a block is an affordance too: `<wiki:If test="hasPermission:edit">` asks `mayShow`, and `<wiki:If test="exists:Page">` asks `mayShowPage`, so a hidden block writes nothing. `<wiki:Include>` serves the other page's content, so it reads through the door (`readPage`) and a refusal is recorded; `resaveForKeywordChange` writes a page, so it asks `canAccess`. When it is unclear which a call is, it is a door.

## Every page a viewer is shown goes through the page-list door

A page that reaches a viewer in a list, a search hit, a count, a suggestion, a feed or a plugin's output is decided by `PolicyInformationPoint`, the decision `/view` makes, never by the index it came from. Two doors, one evaluator:

- `pageManager.listPagesFor(subject, action)` when the list is "every page this reader may see";
- `pageManager.filterPagesFor(subject, names, action)` when something else found the names — a search index, a keyword lookup, a category query ([#1962](https://github.com/jwilleke/ngdpbase/issues/1962)).

Rules:

- An index decides nothing. The search index, Elasticsearch and the page index know words and metadata, not who may read them; their own private-page checks may narrow, never decide.
- Decide before you limit. Filter, then count, slice and page, so a total, `hasMore` or a page number never counts a hidden page. `SearchManager` over-fetches for this, bounded by `ngdpbase.search.access-filter.max-candidates`.
- Batch, never one door call per row: both doors decide a whole list against policy compiled once, with no log line or audit record per page.
- Search through `searchWithContext` / `advancedSearchWithContext` with the request's context, never `search` / `advancedSearch`, which know no reader. A plugin passes its render context; its output is cached per viewer.
- No door means nothing listed: without `PolicyInformationPoint` both doors return nothing, never the unfiltered list.

## A page's audience covers every action; administrators are its one exception

A page's frontmatter `audience` restricts reading and writing alike: someone it leaves out is refused the view, lists and search, the editor, the raw editor, a save, a rename and a delete (operator, 2026-10-23, [#1964](https://github.com/jwilleke/ngdpbase/issues/1964)). The rule is one function, `decideFrontmatterAccess` in `src/utils/frontmatterAccess.ts`, run by `PolicyInformationPoint.walkPageTiers` for every page decision — view, edit, lists and search.

__An audience is for a one-off page, never a lock on a group of pages__ (operator, 2026-10-29, [#2094](https://github.com/jwilleke/ngdpbase/issues/2094)). A single page shared with a few users or roles takes an `audience`. A group of pages is never locked by listing role names on each: an add-on's screens are gated by the permission their data asks for (the manager checks the viewer's context), so a new role reaches them through a grant, with no page edits on any site; filed documents for a group go in a shared folder that opens by permission ([shared-folders.md](../planning/shared-folders.md)). An add-on does not seed pages with `audience` lists.

Rules:

- The exception is a permission, `admin-system`, asked of the PDP (`subjectMayDo(engine, subject, 'admin-system')`), never `roles.includes('admin')`. It is asked only when an audience leaves the subject out, and once per list.
- `access.<action>` has no exception: it binds administrators too. Private stores are decided by their container; the exception never reaches into a vault.
- A write meets the audience at `PageManager`'s write door too: `savePage`, `deletePage` and `getRawPageContent` ask `PolicyInformationPoint.audienceAdmits(subject, metadata)` with the caller's context and throw `PageAudienceRefusedError`, which a route answers with 403. A route still asks the full page decision (`canAccess('edit')`, `writeRefusal`) first; the door is the floor, not the decision.
- __A user in an `audience` or `access[action]` list is named by identity `@id`__ ([#2097](https://github.com/jwilleke/ngdpbase/issues/2097)): `PageManager.savePage` stores a user entry as the @id (`IdentityManager.storedReferenceOf`), and the start-up pass converts existing ones (a name with no account becomes `orphan:<name>`; roles, the pseudo-roles `All`/`Authenticated`/`Anonymous`/`Asserted` and `addon:`/`job:` entries are kept; a name that is both a role and a username stays the role; with no role catalogue nothing is converted). The subject's principals are its roles, its username and its @id (`PolicyInformationPoint.matchableNow` and `principalsOf`; `PageManager.getRecentChanges`/`getPagesSharedWith` for the provider listings), so a converted entry and one not yet converted both match, and an orphan matches nobody. A list filter never compares an access entry with a username alone.
- A job's subject (`resolveRolesNow`) is matched against the roles its principal holds now, by every page question: the page door (`canUserAccessPage`, `pageAffordanceFor`), the list (`filterAccessiblePages`, for its audience and its global policy alike) and the write door (`audienceAdmits`), all through `PolicyInformationPoint.resolveSubjectNow`, the lookup the PDP uses ([#2022](https://github.com/jwilleke/ngdpbase/issues/2022)). The system principal holds `admin-system` by default (`ngdpbase.system.roles`).
- __A scheduled run acts as its job__ ([#1999](https://github.com/jwilleke/ngdpbase/issues/1999), operator 2026-10-22). `BackgroundJobManager` gives a scheduled slot's context `job: <id>` beside the system principal. When a policy in force names that job (`PolicyDecisionPoint.namesJob`), `PolicyInformationPoint.resolveSubjectNow` resolves the subject to `job:<id>` with no roles, so the run holds exactly what the job's policies grant; when none does, it keeps the system principal's roles, as before. Only the system principal's context can act as a job: a request's context carrying `job` decides with that user's own roles. A run started by hand (Run now, a rerun) acts as the admin who started it, with their permissions, so an admin who lacks what the job needs is refused. An add-on's policy may name only its own jobs (`<slug>.<job>`); one naming another's refuses the add-on.

## Only an administrator sets a page's system-category

Nobody but an administrator sets or changes a page's `system-category` (operator, 2026-10-29, [#1503](https://github.com/jwilleke/ngdpbase/issues/1503)). The rule is one method, `PageManager.systemCategoryForWrite(ctx, requested, current, fallback)`, which asks the PDP for `admin-system` with the requester's context, never a role name.

- For anyone else, a new page is the default system-category (`general`; a takeout import, the system-category whose vault it goes into) and an existing page keeps its own. A request naming any other is refused with a 403, "Only administrators can set a page's system category", never silently rewritten.
- Every write path that takes a system-category from a request asks it: the create form, the editor and raw editor (`/save`, which also covers rename and the Private-box move), the ingest API and both takeout import doors, `POST /my/takeout/import` and `core.private-store` on `/import` (`systemCategoryForWrite` in `src/managers/ImportManager.ts`, [#2118](https://github.com/jwilleke/ngdpbase/issues/2118)). A path that sets the category itself (capture, the profile page, an add-on's own pages) is the feature's choice, not the requester's, and does not ask.
- The editor's picker is shown to administrators only; that is an affordance, the server is the door.

## Every security-relevant call carries a context

A manager method that decides access, writes an audit record, or acts on someone's behalf takes the context it was given, positionally. Forward it; never rebuild `{ username, roles, isAuthenticated }` from parts, because the rebuild drops `viaToken` and with it the agent-token scope ceiling. `scripts/check-permission-subject.ts` fails the commit on a rebuild in route code. A job or timer uses `JobContext`; boot paths that act use the system principal. An omitted actor is not "the system"; it is nobody, and the record is wrong.

Hand the deciders the context as you were given it. `pdp.decide`, `pdp.permits` and `pdp.holds`, and `PolicyInformationPoint`'s page questions (`canUserAccessPage`, `pageAffordanceFor`, `filterAccessiblePages`, `audienceAdmits`, `canUserAccessMediaItem`, `canAccessPrivateContainer`), take an `ActorContext` (a request's subject or a job's `JobContext`) and turn it into the subject they decide on themselves, so a job's roles are resolved at decision time and its `viaToken`, `viaShare` and `viaProxy` keep their ceilings ([#2022](https://github.com/jwilleke/ngdpbase/issues/2022)). There is one conversion, `decisionSubject` in `src/context/ActorContext.ts`, called only by those two. Never convert a context before asking: `npm run lint:context` fails the commit on a call to `toPermissionSubject` or `decisionSubject` anywhere else. This binds add-ons too.

## A shared folder opens by permission

A shared folder's pages and files ([#2125](https://github.com/jwilleke/ngdpbase/issues/2125); [SharedFolderManager](../managers/SharedFolderManager.md#folders)) are read with `shared-folder-read` and added to, changed and deleted with `shared-folder-file`, asked of the PDP with the caller's context and the folder as the policy resource (`shared-folder`, `shared/<name>`), through `permitsInSharedFolder` in `src/utils/sharedFolderAccess.ts`. Never a role, never the vault owner rule, never the vault policy, and never a share link. A folder lists no roles; a policy names the folder. The shipped folder policies (`shared-folder-default`, `shared-folder-admin`, `shared-folder-executive-read`, `shared-folder-executive-file`; operator, 2026-10-30, [#2095](https://github.com/jwilleke/ngdpbase/issues/2095)) are the examples under [Roles, permissions and policies](#roles-permissions-and-policies); a site delegates `shared-folder-file` on a folder to anyone else (a secretary on `shared/executive`) by its own policy, never by a new permission. Reading opens the folder's key, so a key in hand is never permission to write: the page door asks `shared-folder-file` itself (`PageManager.assertMayFileInSharedFolder`, in `savePage` and `deletePage`), and the file door asks per action (`AttachmentManager.mayInVault`). Code that reaches a folder goes through the page and file doors, which already ask; a new door asks `SharedFolderManager.mayInFolder` (or `permitsInSharedFolder`) for the action it does. A folder's key reaches the store I/O only for a context the PDP has permitted on that folder, so never copy a subject (`{ ...ctx }`) before reading a folder: the copy holds no key.

## Roles, permissions and policies

How access fits together. The full rules of evaluation are in [access-policies.md](../access-policies.md); this is the model a developer works from, with the shipped policies as examples.

- A __permission__ is a named action, such as `page-edit` or `shared-folder-file`, declared in `ngdpbase.permissions.definitions`. Code only ever asks for a permission (`hasPermission`, `canAccess`, `pdp.decide`), never a role.
- A __role__ is a name in `ngdpbase.roles.definitions` that accounts hold. It grants nothing by itself; its description says what the policies naming it add up to.
- A __policy__ in `ngdpbase.access.policies` connects them:
  - `subjects`: who, a `role` (or a scheduled `job`);
  - `resources`: what, a resource type and a pattern, such as `page` / `*` or `shared-folder` / `shared/executive`;
  - `actions`: which permissions;
  - `effect`: `allow` or `deny`;
  - `priority`: policies are tried highest first, and the first one whose subjects, resources and actions all match decides. No match is a refusal.

### Aiming a permission at a resource

A policy's resource pattern aims its permissions at the resources it matches (micromatch globs). A check names the resource it is about, and only policies whose pattern matches it count: `shared/*` matches every shared folder, `shared/executive` that folder alone, `page` / `*` every public page (not a vault page, whose name holds a `/`). So one permission, `shared-folder-file`, is "file in the Executive shared folder" in one policy and "file in every shared folder" in another; no per-folder permission is needed.

### Capability check and resource check

- A __capability check__ asks a permission with no resource (`pdp.permits(ctx, 'admin-system')`, `hasPermission('page-delete')`): "may this subject do this kind of thing at all?".
- A __resource check__ asks it about one resource (`canAccess('edit', page)`, `permitsInSharedFolder(pdp, ctx, 'page-read', 'executive')`), with the resource's attributes, such as `shared-folder: shared/executive` or the page's `vault`.

A resource attribute is supplied only when that resource is asked about, so a grant aimed at a `shared-folder` or a `vault` never answers a capability check or a check on anything else: `pdp.permits(ctx, 'shared-folder-read')` is false for every account, administrators included.

### Examples

Every account (the role `ngdpbase.user.account-roles` gives every account, never anonymous) may read and file in `/shared/default`:

```json
{
  "id": "shared-folder-default",
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "vault-owner" }],
  "resources": [{ "type": "shared-folder", "pattern": "shared/default" }],
  "actions": ["shared-folder-read", "shared-folder-file"]
}
```

Administrators read and file in every shared folder:

```json
{
  "id": "shared-folder-admin",
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "admin" }],
  "resources": [{ "type": "shared-folder", "pattern": "shared/*" }],
  "actions": ["shared-folder-read", "shared-folder-file"]
}
```

Executives read every shared folder, and file only in `/shared/executive` (two policies, one aim each). Their own vaults stay their owners': a vault is not a shared folder, and the vault container rule admits only the owner.

```json
{
  "id": "shared-folder-executive-read",
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "executive" }],
  "resources": [{ "type": "shared-folder", "pattern": "shared/*" }],
  "actions": ["shared-folder-read"]
}
```

```json
{
  "id": "shared-folder-executive-file",
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "executive" }],
  "resources": [{ "type": "shared-folder", "pattern": "shared/executive" }],
  "actions": ["shared-folder-file"]
}
```

A site delegates filing in `/shared/executive` to its secretary, with a role and a policy of its own (not shipped):

```json
{
  "id": "site-secretary-files-executive",
  "effect": "allow",
  "priority": 60,
  "subjects": [{ "type": "role", "value": "secretary" }],
  "resources": [{ "type": "shared-folder", "pattern": "shared/executive" }],
  "actions": ["shared-folder-read", "shared-folder-file"]
}
```

Administrators hold the page and site permissions on every public page (abridged; the shipped list is longer):

```json
{
  "id": "admin-full-access",
  "priority": 100,
  "effect": "allow",
  "subjects": [{ "type": "role", "value": "admin" }],
  "resources": [{ "type": "page", "pattern": "*" }],
  "actions": ["page-read", "page-edit", "page-create", "page-delete", "admin-system"]
}
```

### A site's own role and policy

A site adds both in its `app-custom-config.json` (on the instance's data volume, never in a manifest), the top layer of the configuration merge ([configuration-developer-guide.md](configuration-developer-guide.md)): the role as an entry of the `ngdpbase.roles.definitions` map, the policy as an entry of `ngdpbase.access.policies`, which merges with the shipped list by `id`, so the shipped policies stay. An add-on does the same in its own `config/default-config.json` ([add-ons guide](addons-developer-guide.md#permissions)). Adding a role or a policy grants no new permission name: grant an existing one, aimed at the resource.

```json
{
  "ngdpbase.roles.definitions": {
    "secretary": { "name": "secretary", "displayname": "Secretary", "description": "Files the board's papers in the Executive shared folder", "issystem": false }
  },
  "ngdpbase.access.policies": [
    {
      "id": "site-secretary-files-executive",
      "effect": "allow",
      "priority": 60,
      "subjects": [{ "type": "role", "value": "secretary" }],
      "resources": [{ "type": "shared-folder", "pattern": "shared/executive" }],
      "actions": ["shared-folder-read", "shared-folder-file"]
    }
  ]
}
```

### Who can do X here

- On the site: Admin → Roles (`/admin/roles`) lists each role's permissions as the policies grant them, marking a grant that applies only somewhere (a vault, a folder); the policies themselves, with their resources, are `ngdpbase.access.policies` in Admin → Configuration. Admin → Shared folders (`/admin/shared-folders`) shows, per folder, the roles its own policies give and every other policy that reaches it ([#2126](https://github.com/jwilleke/ngdpbase/issues/2126)). Find the policies that name the permission, read their resource patterns, then their subjects; the highest-priority match wins.
- In code: `PolicyDecisionPoint.usersHolding(action)` lists the accounts holding a permission, and `SharedFolderManager.foldersReadableBy(ctx)` the folders one subject may open. Never compare role names.

## A closed account holds nothing

An account deleted or turned off loses every way in at once, through `AuthManager.closeAccess` ([#1765](https://github.com/jwilleke/ngdpbase/issues/1765)): its sessions in the live session store, and, on delete, its tokens, app grants, shares, proxy grants, credentials and consent records ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603)). A session is also held to its account on every request, so one the close missed, or one whose username a new account took, is refused ([#1937](https://github.com/jwilleke/ngdpbase/issues/1937)). The rules are in [authentication-developer-guide.md](authentication-developer-guide.md#standing-rules). A new kind of access an account can hold is closed there, and anything that names an account only by its username must not outlive it: a new account can take the name.

## Consent

What a user accepted (the site's terms, an add-on's documents) is `ConsentManager`'s ([#1603](https://github.com/jwilleke/ngdpbase/issues/1603); [ConsentManager.md](../managers/ConsentManager.md)). The rules that bind code:

- Record an acceptance only through `consentManager.accept(ctx, scope, seen, how)`, with the request's own context. It refuses a token, a share link and a proxy (a proxy cannot accept for the user represented), asks for `profile-manage`, and has no parameter naming another user: nobody accepts on someone's behalf, an administrator included.
- `seen` is what the user was shown, each document with its version. Never fill it from the current documents on the server: a version that changed while they read must be refused, not recorded.
- `consent-grant` is on-failure refuse and is recorded before the record is stored. No record means no acceptance; never treat a failed acceptance as given.
- The terms prompt is part of sign-in completion (`AuthManager.completeSignIn`), and the consent gate holds the session to it. A new way to sign in that does not end in `completeSignIn` skips the prompt.
- A user with documents to accept learns it from the consent gate, never from a mechanism of your own ([#2027](https://github.com/jwilleke/ngdpbase/issues/2027)): it sets `res.locals.consentNotice` on every page read and the header shows the banner; a held request is refused with `sendApiError` and an `ApiError` carrying `consent` (the prompt's link), so a page or a form POST is redirected to `/consent` and anything else gets the same words and the link as JSON. Throw that `ApiError` the same way if a route ever refuses for consent.
- A delegated credential (agent token, approved app, proxy) is never held by a terms change; only an interactive sign-in asks.
- Saving the recovery words is a consent, not a preference ([#1928](https://github.com/jwilleke/ngdpbase/issues/1928)): scope `recovery-words`, bound to the set of words by `subject` (`recoveryWordsId`). A screen that shows recovery words includes `_recovery-words-consent.ejs`, refuses to finish without `WikiRoutes.recoveryWordsSaved(...) === 'ok'`, and records through `WikiRoutes.recordRecoveryWordsSaved`. Its reminder is a banner (`recoveryWordsNotice`: the home page, `/admin`, `/profile`, `/my/vaults` and the user's encrypted vaults' pages) that holds nothing; never put it behind the consent gate.
- Saving the organization's shared-folders recovery words is the same kind of consent ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124)): scope `shared-folders-recovery-words`, bound to the organization's set of words, and only the admin who was shown them can give it. Its banner (`sharedFoldersWordsNotice`) is for holders of `admin-system` and holds nothing.
- A screen that shows new recovery words proves they were kept before anything is saved, and lets them leave the screen only from the set still waiting ([#2144](https://github.com/jwilleke/ngdpbase/issues/2144)): all 12 typed back (`_recovery-words-typeback.ejs`, `WikiRoutes.typedRecoveryWords`, compared with `sameMnemonic`) beside the tick; Download as a file and Print through `_recovery-words-show.ejs`, each recorded first as `recovery-words-export` (who, which set, how; never the words; on-failure refuse) and answered `no-store` (`WikiRoutes.sendRecoveryWords`, the sheet in `src/utils/recoveryWordsFile.ts`). The store door and the shared folders' words page both do this. Replacing the shared folders' set needs `admin-system` with a fresh sign-in (asked as `config-manage`, the step-up permission Admin → Backup's key pages ask) at the door that makes it and again at the one that saves it, and records the consent again (`how: new-words`).
- Per-use consents stay with their owners (`OidcManager` for approved apps, `ShareManager` for share links). Read them from there; never copy them into consent records.

## Permissions and policies are configuration

- `ngdpbase.permissions.definitions` is the permission catalog: `{target}-{action}`, target first, hyphen separated. Callers read it live with `ConfigurationManager.getProperty('ngdpbase.permissions.definitions')`; there is no list in code. `UserManager` does not hold the catalog. Each grantable entry carries a `label`, the plain words a user reads; `description` is for administrators and developers. `permissionLabel` / `describeScopes` in `src/utils/permissionCatalog.ts` are the one lookup, and `AuthManager.describeScopes` reads it against the live catalog (#1764).
- `ngdpbase.access.policies` grants permissions to subjects. `hasPermission` resolves through `PolicyEvaluator` over these; a permission that appears in a policy is honoured whether or not anything else names it.
- Roles are lists in `ngdpbase.roles.definitions`, additive, unordered, never gating anything. A role change is a configuration change and is recorded as `config-change`.

__Adding a permission for a new action:__ declare it in the catalog with description, icon and colour; grant it in a policy; ask for it at the door. A catalog entry that only declares an audit event is `"grantable": false` and is never granted ([audit-developer-guide.md](audit-developer-guide.md)). The registry-drift test fails when a permission is declared and checked nowhere, or checked and declared nowhere.

## Secrets in configuration

A secret in configuration is a `$NAME` reference to an environment variable, at the top level of a key or anywhere inside a map or list, and it is declared `secret` in `ngdpbase.config.sensitive-values`, by key or by a path with `*` for a map key ([#1889](https://github.com/jwilleke/ngdpbase/issues/1889)). The rules, and every place a value is shown and so hidden, are in [configuration-developer-guide.md](configuration-developer-guide.md#standing-rules). Two that bind code:

- Show, log or record a configuration value only through `utils/sensitiveValues.ts` (`shownValue` for a viewer; `hideDeclaredPaths` with `NO_SECRETS` for an admin screen, a log line or an audit record). A new screen or record that renders a value with neither leaks what a path entry names.
- `getUnresolvedProperty` returns the reference, not the secret. Use it only to check that a secret is a reference; a literal secret comes back as itself.

## Addons

An addon's `config/default-config.json` is a layer of the configuration merge, between the shipped defaults and the operator's custom file, folded in when `ngdpbase.addons.<slug>.enabled` is true. The author's copy of the recipe — declare a permission, grant it in a policy with its own `id`, check it with `hasPermission` / `canAccess` — is [Permissions](addons-developer-guide.md#permissions). The file, the merge, and where the operator overrides it are [Configuration](addons-developer-guide.md#configuration). Do not append to a role's `permissions` array from an addon: a plain array replaces wholesale on merge; a policy with its own `id` merges by id. An addon never names a role. Bundled and external addons are treated alike; discovery follows `ngdpbase.managers.addons-manager.addons-path`.

An add-on runs in the process and is handed the engine, so a name it gives a core method is no proof of who it is. A power only core may hold cannot hang on the caller's name: put it behind a private method (`#name`) that only core's own code reaches, and have the public method refuse it from every caller. An ICE receiver's `writesEncrypted` (its uploads run in the request with the user's unlocked key, and its imports are confidential) is set only for core's own receivers, through `ImportManager`'s private `#registerReceiver`; the public `registerReceiver` refuses it whatever owner is named, `core` included ([#2179](https://github.com/jwilleke/ngdpbase/issues/2179)). Copy what the caller gives once and check and store the copy: an add-on's object can answer a second read differently, through a getter.

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

- [#1925](https://github.com/jwilleke/ngdpbase/issues/1925) — a user cannot make a new set of recovery words while signed in yet. When it is built, its screen asks the recovery-words consent for the new set (the hook is `WikiRoutes.recordRecoveryWordsSaved`, `how: new-words`); until then a user who lost their words can only keep the reminder.
- [#1775](https://github.com/jwilleke/ngdpbase/issues/1775) — shared folders: slices 1 and 2 and `/shared/executive` are built ([#2124](https://github.com/jwilleke/ngdpbase/issues/2124), [#2125](https://github.com/jwilleke/ngdpbase/issues/2125), [#2095](https://github.com/jwilleke/ngdpbase/issues/2095)). A folder other than `default` and `executive` opens to anyone but administrators (read and file) and executives (read), only through a policy written in configuration until the admin Shared folders screen ([#2126](https://github.com/jwilleke/ngdpbase/issues/2126)); rotation, recovery with the words, add-on folders and deleting a folder come later (a new set of words is built, [#2144](https://github.com/jwilleke/ngdpbase/issues/2144)) ([SharedFolderManager](../managers/SharedFolderManager.md#known-gaps)).
- [#1999](https://github.com/jwilleke/ngdpbase/issues/1999) — a job id's `<slug>.` prefix is enforced in an add-on's policies but not at `registerJob`, which cannot tell its caller.
- [#2179](https://github.com/jwilleke/ngdpbase/issues/2179) — an add-on refused partway through its `register()` (a receiver that declares `writesEncrypted`, or any other refusal) keeps what it registered before the refusal: its shims, receivers and routes stay live while it is marked failed, as core cannot unload a half-loaded add-on. The slug `core` is not reserved either: an add-on can register ids under `core.`, though not with `writesEncrypted`.
- [#1762](https://github.com/jwilleke/ngdpbase/issues/1762) — proxy access is complete (slices 1–7), reachable while `ngdpbase.auth.proxy-access.enabled` is on. The private-store risk (a proxy's username matching the owner's) is closed, and the audit queries take the subject. Left: the "Jim acted for you" entries wait for the sign-in history page ([#1766](https://github.com/jwilleke/ngdpbase/issues/1766)); after a proxy approves a device, the browser's provider session stays signed in as the user represented, so the proxy's own app sign-in is refused (fails closed) until that session ends.
- [#2093](https://github.com/jwilleke/ngdpbase/issues/2093) — the `executive` role reads through the ordinary page decision, so a one-off page whose `audience` or `access` list leaves `executive` out stays closed to it until whoever owns the page adds the role. The add-ons' own screens carry no audience (above), so they open to it through the add-ons' grants ([#2094](https://github.com/jwilleke/ngdpbase/issues/2094)); a site that seeded those pages before then keeps their old lists until the add-on's upgrade clears them.
- [#1937](https://github.com/jwilleke/ngdpbase/issues/1937) — what a closed account's sessions still cannot be checked against (old sessions with no sign-in time, stores that cannot list by id) is in the authentication guide's Known gaps.
- [#1962](https://github.com/jwilleke/ngdpbase/issues/1962) — page surfaces not yet through the page-list door: the keyword and category catalogs on the `/search` page and in the editor (`SearchManager.getAllUserKeywords` / `getAllSystemKeywords` / `getAllCategories`) name keywords of pages the reader cannot open; the journal marquee's public-entry count (`JournalDataManager.publicCount`) counts them; a keyword share album's pages are chosen by `searchByUserKeywords` and its own exclusion list (`ShareManager.isPageExcluded`: private, audience, access), a second copy of part of the rule that does not see a policy such as a system-category deny. `SearchManager.getSuggestions` and `WikiRoutes.searchSuggestions` filter nothing but are not routed.
- [#1964](https://github.com/jwilleke/ngdpbase/issues/1964) — the provider-level listings that decide Tier 1 from a principal list, not through the page-list door (`getRecentChanges` for RecentChanges and AppHealth, `getPagesSharedWith` for "shared with me"), are given no enabled add-ons and no administrator exception, so an `addon:<slug>` page is left out of them even for a user with the add-on on, and an audience page is left out for an administrator outside its audience. It under-lists; it never shows the page to anyone else.
