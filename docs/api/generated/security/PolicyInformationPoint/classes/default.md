[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/PolicyInformationPoint](../README.md) / default

# Class: default

Defined in: src/security/PolicyInformationPoint.ts:243

PolicyInformationPoint — what a page decision needs to know about the page
(#1431; was ACLManager until step 8).

In the model the access subject follows (docs/managers/Manager-SOT.md):

- the __PEPs__ are the doors — routes, manager doors, the availability gate;
- the __PDP__ (`PolicyDecisionPoint`) answers "may this subject do this", with
  the delegation ceilings, over the policies;
- __this__ supplies the page's own attributes and walks the page's own rules
  in order, asking the PDP where global policy decides;
- the __PAP__ is ConfigurationManager plus the admin screens.

What it holds, all of it about a PAGE (or a private container, or media
linked to one):

- `walkPageTiers` — the one implementation of the page's rules: private
  (owner or delegate, never a role), author-lock (`edit` only; the override
  is the `admin-system` permission), frontmatter `audience` / `access`, then
  the share or global policy. Shared by every entry point below (#1431 7c).
- `checkPagePermissionWithContext` / `evaluatePagePermission` — one page, for
  a request that already holds it; the latter returns the reason. These are
  the doors: asked before acting, and every decision is recorded.
- `pageAffordance` / `pageAffordanceFor` — the same evaluator (this page /
  another page), asked only to decide whether to show a control; records
  nothing (#1668).
- `canUserAccessPage` — another page, loaded as this subject (cross-page:
  inserts, includes, attachments).
- `filterAccessiblePages` — many pages, over the index, with no per-page
  disk read, log line or audit record; agrees with the single-page answer in
  both directions (#1219).
- `canUserAccessMediaItem` / `canAccessPrivateContainer` — media and store
  files, by the same rules.
- `logAccessDecision` — every single-page door decision is recorded; a
  denial becomes an `authorization-deny` record carrying the request's
  address. An affordance is not recorded.

What it no longer holds, so nobody goes looking: JSPWiki's page-body ACL
markup (#1431 7a — imports convert it to audience terms, #1446); the
availability checks (#1432); a policy cache (#1431 step 4); any role-name
gate (#1431 7b).

 PolicyInformationPoint

## See

- [PolicyDecisionPoint](../../PolicyDecisionPoint/classes/PolicyDecisionPoint.md) for the decision over the policies
- [PolicyEvaluator](../../../managers/PolicyEvaluator/classes/default.md) for policy matching
- AuditManager for the access record

## Example

```ts
const pip = engine.getManager('PolicyInformationPoint');
if (await pip.checkPagePermissionWithContext(wikiContext, 'edit')) { ... }
```

## Extends

- [`default`](../../../managers/BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`, `clock?`): `PolicyInformationPoint`

Defined in: src/security/PolicyInformationPoint.ts:256

Creates a new PolicyInformationPoint instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

##### clock?

() => `Date`

The time `environment:` attributes are read at; injectable for tests

#### Returns

`PolicyInformationPoint`

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`constructor`](../../../managers/BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`config`](../../../managers/BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`description`](../../../managers/BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`engine`](../../../managers/BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`initialized`](../../../managers/BaseManager/classes/default.md#initialized)

## Methods

### anonymousSubject()

> __anonymousSubject__(): `UserContext`

Defined in: src/security/PolicyInformationPoint.ts:294

The anonymous visitor. Lowercase `anonymous` is the role the policies name (#1059).

#### Returns

`UserContext`

***

### audienceAdmits()

> __audienceAdmits__(`caller`, `metadata`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:1470

Does the page's `audience` admit this subject (#1964)? True when the page
names no audience, the subject matches it, or the subject holds
`admin-system`. The same rule Tier 1 applies, asked by PageManager's
write door, so a write cannot reach a page its writer is outside the
audience of — whatever route it came by. Records nothing; the door does.

#### Parameters

##### caller

`PageQuestionCaller`

the caller's context, as given (a job's included, #2022)

##### metadata

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null` \| `undefined`

the page's current frontmatter

#### Returns

`Promise`\<`boolean`\>

***

### backup()

> __backup__(`_options?`): `Promise`\<[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BaseManager.ts:663

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Parameters

##### \_options?

[`ManagerBackupOptions`](../../../managers/BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)\>

Backup data object containing all manager state

#### Throws

If backup operation fails

#### Example

```ts
async backup(): Promise<BackupData> {
  return {
    managerName: this.constructor.name,
    timestamp: new Date().toISOString(),
    data: {
      users: Array.from(this.users.values()),
      settings: this.settings
    }
  };
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`backup`](../../../managers/BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/BaseManager.ts:390

Where this manager keeps its data as folders or files (#1985): declared,
never backed up by hand. BackupManager archives each beside the backup
document (`<stem>.<part>.tar`), stages it in a site restore, and puts the
staged copy in place at the next start, in `initialize()` above, before
the subclass reads it. Resolved from the configuration, so it can be
answered before the subclass's own `initialize()` has run. Default none.

A manager with data in the document as well keeps its `backup()`; a
declared part's record goes beside that data (`data[part]`), or is the
entry's `data` when the manager has none and declares one part.

#### Returns

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`backupFolders`](../../../managers/BaseManager/classes/default.md#backupfolders)

***

### canAccessPrivateContainer()

> __canAccessPrivateContainer__(`caller`, `owner`, `resource`, `action`, `vault?`): `boolean`

Defined in: src/security/PolicyInformationPoint.ts:939

The private-container decision for something that is not a page — a file
in a store (docs/private-stores.md, Access). The same rule a
private page gets at Tier 0: the owner, or a delegate of the owner; never
a role. A refusal is recorded like any page refusal (`authorization-deny`).

#### Parameters

##### caller

`PageQuestionCaller`

the caller's context, as given: a request's subject or a job's (#2022); null is anonymous

##### owner

`string`

the container's owner (a private file's `creator`)

##### resource

`string`

what is being reached, for the record (e.g. `attachment:<id>`)

##### action

`string`

the action asked for (e.g. `view`)

##### vault?

`string`

the vault inside the container, when the question is about one:
  a share link the owner issued gets in only for a vault it names (#1388)

#### Returns

`boolean`

***

### canUserAccessMediaItem()

> __canUserAccessMediaItem__(`caller`, `item`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:1210

May this user read this media item? (#1223, epic #1225)

The media door's question, asked of the evaluator rather than answered
in `MediaManager.getItem` and again in the share routes.

__The share ceiling__, for a subject carrying `viaShare` — the twin of
the page ceiling in `_runEvaluator`: `asset-read` must be delegated, the
share unexpired, the item's keywords covered by the share's media
resources (and not `owner-only`), and the issuer still holding
`asset-read` live. An ordinary session is allowed: media items carry no
per-item privacy and no page link (#1427).

A refusal is audited as `authorization-deny` on the media resource, with
the share attribution when there is one.

#### Parameters

##### caller

`PageQuestionCaller`

##### item

[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)

#### Returns

`Promise`\<`boolean`\>

***

### canUserAccessPage()

> __canUserAccessPage__(`caller`, `pageName`, `action`, `knownMetadata?`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:990

Check whether a user can access a given page — for cross-page checks where
the current WikiContext describes a DIFFERENT page than the one being
checked (#714 Slice B).

Loads the target page's metadata internally (`PageManager.getPageMetadata`)
and constructs a minimal WikiContext shape for the evaluator. This is the
implementation that WikiContext.canAccess delegates to when its
`pageNameOverride` parameter is set.

Used today by:

- linked-page visibility filters (a list page wanting to drop entries
    the user can't view)
- WikiRoutes.serveAttachment's owning-page check (the page
    hosting the attachment may be private; the request URL is the
    attachment URL, not the page URL).

Returns false when:

- the target page has no resolvable metadata (deleted, never existed,
    or PageManager unavailable). This is the __conservative-on-security__
    default — see #714 EPIC body's "Behavior decision point" for the
    pre-#714 allow→deny shift for the private-attachment-no-page-name
    case.
- any tier returns deny.

#### Parameters

##### caller

`PageQuestionCaller`

The caller's context, as given: a request's subject or a job's (#2022); null / undefined is anonymous.

##### pageName

`string`

Target page to check.

##### action

`string`

Action verb (e.g., `'view'`, `'edit'`, `'delete'`).

##### knownMetadata?

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)

The page's metadata when the caller has just
  resolved it: the page door (#1622), which reads the page by the same
  resolution it decides on. Omitted, it is loaded here.

#### Returns

`Promise`\<`boolean`\>

***

### checkPagePermissionWithContext()

> __checkPagePermissionWithContext__(`wikiContext`, `action`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:585

Check page permission using WikiContext — boolean (back-compat) form.

Thin wrapper around [evaluatePagePermission](#evaluatepagepermission) (#714 Slice F) that
discards the `reason` and returns just `allowed`. Existing callers
(which only care about allow/deny) keep working without change.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing page and user info

##### action

`string`

Action to check (view, edit, delete, rename, upload)

#### Returns

`Promise`\<`boolean`\>

True if permission granted

#### Async

#### Example

```ts
const canEdit = await policyInformationPoint.checkPagePermissionWithContext(wikiContext, 'edit');
if (canEdit) console.log('User can edit page');
```

***

### currentSubject()

> __currentSubject__(`req`): `Promise`\<`UserContext`\>

Defined in: src/security/PolicyInformationPoint.ts:447

Who is making this request: the subject the session middleware resolved,
else the session's account resolved now, else the anonymous visitor.
It was `UserManager.getCurrentUser` until #1431 step 13.

__This returned Anonymous for every authenticated user, always (#1165).__
It read `req.session.user.isAuthenticated`, and nothing in the codebase
ever writes `req.session.user` — every login path writes the flat
`req.session.username` + `req.session.isAuthenticated`
(`WikiRoutes.ts:6786`, `:7002`, `:7081`, `app.ts:657`), which is also what
the session middleware reads. `session.user` is a declared field with no
writer, so the condition was never true.

It went unnoticed because the one hot caller guards against it:
`getCommonTemplateData` uses `req.userContext || getCurrentUser(req)`, so
every rendered page took the first branch and looked correct. The audit
routes call this directly, which is why they were the ones to break —
`AuditManager` refused the query as 'Anonymous' on a request the route had
just authorised as an admin.

__`req.userContext` is preferred over the session now__, rather than only
repairing the field name. It is the identity the middleware already
resolved and validated, enriched with roles from RoleManager, and it is
what the policy engine authorises against — so this method and every
permission check now answer from the same place instead of two. It is also
the only identity a bearer-token request has (#818): those carry no
session at all, so the session path alone would still have said Anonymous.

#### Parameters

##### req

`Request`

#### Returns

`Promise`\<`UserContext`\>

***

### environmentAttribute()

> __environmentAttribute__(`name`, `now?`): `boolean` \| `undefined`

Defined in: src/security/PolicyInformationPoint.ts:1357

An environment attribute a condition reads (#2261): `environment:<name>`,
declared in `ngdpbase.access.environment-attributes` and read from its
`from` source here, the only place one is read. `schedule:<name>` is whether
that schedule in `ngdpbase.schedules` is open at `now`; `config:<key>` is
the boolean stored at that configuration key, any key, secrets included.
Missing when it is not declared, the schedule is absent, the stored value is
not a boolean, or the read fails; the evaluator then fails closed. The value
is returned to the evaluator and goes nowhere else: it is never logged.

#### Parameters

##### name

`string`

##### now?

`Date` = `...`

#### Returns

`boolean` \| `undefined`

***

### environmentReader()

> __environmentReader__(): (`name`) => `unknown`

Defined in: src/security/PolicyInformationPoint.ts:1390

A reader of environment attributes for one decision or one listing
(#2261): the clock is read once, on the first attribute asked for, and
each attribute once, so every policy and every page sees one instant.

#### Returns

(`name`) => `unknown`

***

### evaluatePagePermission()

> __evaluatePagePermission__(`wikiContext`, `action`): `Promise`\<\{ `allowed`: `boolean`; `reason`: `string`; \}\>

Defined in: src/security/PolicyInformationPoint.ts:565

Check page permission using WikiContext — rich-return form (#714 Slice F).

Same evaluator as [checkPagePermissionWithContext](#checkpagepermissionwithcontext) but returns a
`{ allowed, reason }` object instead of a bare boolean. Lets callers
specialise their 403 response on the reason — e.g. an editPage route
handler can detect `reason === 'author_lock_deny'` and render the
specific "This page is author-locked" message rather than the generic
"no permission to edit" 403.

`reason` values currently emitted (from `logAccessDecision` call sites):

- `token_scope_deny`                         (Tier -1, the PDP's ceiling)
- `share_action_deny` / `share_expired` / `share_resource_deny` /
    `share_issuer_deny`                        (Tier -1, the PDP's ceiling)
- `private_match` / `private_deny`           (Tier 0)
- `author_lock_deny`                         (Tier 0.5 — Slice A)
- `frontmatter_principal_<p>` / `frontmatter_deny`  (Tier 1)
- `<policyName>` / `global_policy`           (Tier 2)
- `default_deny`                             (no tier decided)

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing page and user info

##### action

`string`

Action to check (view, edit, delete, rename, upload)

#### Returns

`Promise`\<\{ `allowed`: `boolean`; `reason`: `string`; \}\>

Rich decision

#### Async

***

### filterAccessiblePages()

> __filterAccessiblePages__(`caller`, `action`, `candidates`): `Promise`\<`string`[]\>

Defined in: src/security/PolicyInformationPoint.ts:1100

Which of these pages may this user perform `action` on? (#1219)

Rule 10's `filter(ctx, action, query)`: the tiers `_runEvaluator` applies
to ONE page, applied over the page index — no disk read (metadata comes
from the provider's in-memory cache), no log line and no audit record per
page. Listing many and deciding one are the same evaluator, so a listing
can never name a page its reader cannot open, nor hide one they can.

Tier by tier, mirroring `_runEvaluator`: the token and share ceilings
(once for the subject, then the share's resource cover per page); tier 0
private through `PageManager.checkPrivatePageAccess`; tier 0.5
author-lock for `edit`; tier 1 frontmatter audience/access; tier 2 global
policy, compiled once through `PolicyEvaluator.compile`, or the share
standing in for it. There is no longer a tier below that: the deprecated
page-ACL markup was deleted in #1431 step 7, which is what removed the one
divergence this filter had from `canUserAccessPage` — it could not read
page content, so a page granted only by that markup used to be hidden
here and visible there.

A candidate without metadata is not listed (#714's convention). Order is
preserved. Returns titles.

#### Parameters

##### caller

`PageQuestionCaller`

##### action

`string`

##### candidates

readonly `object`[]

#### Returns

`Promise`\<`string`[]\>

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`getEngine`](../../../managers/BaseManager/classes/default.md#getengine)

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:799

What this manager holds (#1006).

__Counts and health only — never item contents.__ That is the whole safety
property, and it is why this is not the `getAll()` the question originally
asked for. `AgentTokenManager` holds bearer credentials, `UserManager`
holds users, `ShareManager` holds capability tokens; a generic enumeration
on the base class means the first generic caller — an admin dump panel, a
search indexer, a debug route — reaches all of it by default. A count
cannot leak what it counts.

Optional by override, with a safe default, exactly like `backup()` and
`toMarqueeText()` above. A manager holding no countable collection omits
`count` rather than reporting `0`, because "nothing to count" and "none"
are different answers and an admin row that shows `0` for
`RenderingManager` is noise.

__Never throws.__ A broken manager reports `healthy: false`; it does not
take down the page rendering every other manager. The base wraps nothing,
so an override that can fail must catch its own errors — see the note on
`safeGetManagerStats()`.

__Named `getManagerStats`, not `getStats`.__ Two managers already have a
`getStats()` returning their own domain shape — `FilterManager` (pipeline
statistics, #615) and `NotificationManager` (`NotificationStats`, read by
a live route). Both are correct for what they do, and taking the name from
them would either break those callers or leave `getStats()` meaning two
different things depending on the manager, which is the exact confusion
this contract exists to remove. A generic caller needs a name that means
one thing everywhere.

#### Returns

`Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`getManagerStats`](../../../managers/BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`getManagerStatus`](../../../managers/BaseManager/classes/default.md#getmanagerstatus)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/security/PolicyInformationPoint.ts:273

Initializes the PolicyInformationPoint by loading policies and configurations

Loads access policies from configuration and initializes the policy
evaluator for context-aware permission evaluation.

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await policyInformationPoint.initialize();
console.log('ACL system ready');
```

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`initialize`](../../../managers/BaseManager/classes/default.md#initialize)

***

### initializeAuditLogging()

> __initializeAuditLogging__(): `Promise`\<`void`\>

Defined in: src/security/PolicyInformationPoint.ts:499

Initialize audit logging system based on configuration.

#### Returns

`Promise`\<`void`\>

***

### invalidateHandlerCache()

> `protected` __invalidateHandlerCache__(`pageUuid`): `void`

Defined in: src/managers/BaseManager.ts:463

A page's data changed outside savePage: its cached content goes, and every cached render re-renders (#1751).

#### Parameters

##### pageUuid

`string`

#### Returns

`void`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`invalidateHandlerCache`](../../../managers/BaseManager/classes/default.md#invalidatehandlercache)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/managers/BaseManager.ts:446

Check if manager has been initialized

#### Returns

`boolean`

True if manager is initialized

#### Example

```ts
if (manager.isInitialized()) {
  // Safe to use manager
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`isInitialized`](../../../managers/BaseManager/classes/default.md#isinitialized)

***

### isSystemPrincipal()

> __isSystemPrincipal__(`username`): `boolean`

Defined in: src/security/PolicyInformationPoint.ts:319

Whether `username` names the system principal. Case-insensitive, like the user store.

#### Parameters

##### username

`string`

#### Returns

`boolean`

***

### logAccessDecision()

> __logAccessDecision__(`userOrObj`, `pageName?`, `action?`, `allowed?`, `reason?`, `_context?`): `void`

Defined in: src/security/PolicyInformationPoint.ts:1509

Record/audit an access decision.
Accepts either a single object or positional args for backward compatibility.

#### Parameters

##### userOrObj

`UserContext` \| `AccessDecisionLog`

##### pageName?

`string`

##### action?

`string`

##### allowed?

`boolean`

##### reason?

`string`

##### \_context?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`void`

***

### markDegraded()

> `protected` __markDegraded__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:540

Record that this manager is configured, wanted, and not working.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markDegraded`](../../../managers/BaseManager/classes/default.md#markdegraded)

***

### markDisabled()

> `protected` __markDisabled__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:555

Record that this manager is deliberately off. Not a problem (#1155).

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markDisabled`](../../../managers/BaseManager/classes/default.md#markdisabled)

***

### markFailed()

> `protected` __markFailed__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:560

Record that this manager could not initialise at all (#1155).

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markFailed`](../../../managers/BaseManager/classes/default.md#markfailed)

***

### markNeedsAttention()

> `protected` __markNeedsAttention__(`reason`, `configKey?`, `opts?`): `boolean`

Defined in: src/managers/BaseManager.ts:550

Record that this manager works, but an administrator has something to do
(#1946). Still `degraded` — it stays on the dashboard, is audited, and
clears with `markReadyIfDegradedBy` — but shown as needing attention, not
as down.

#### Parameters

##### reason

`string`

##### configKey?

`string`

##### opts?

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markNeedsAttention`](../../../managers/BaseManager/classes/default.md#markneedsattention)

***

### markReady()

> `protected` __markReady__(): `boolean`

Defined in: src/managers/BaseManager.ts:571

Record that this manager is working.

Clears the reason rather than leaving a stale one behind — a recovered
manager still carrying "the directory is not writable" is a worse lie than
no reason at all.

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markReady`](../../../managers/BaseManager/classes/default.md#markready)

***

### markReadyIfDegradedBy()

> `protected` __markReadyIfDegradedBy__(`reason`): `boolean`

Defined in: src/managers/BaseManager.ts:580

Record that this manager is working again, but only while it is still
degraded for `reason` — the one a check set, now cleared by re-running
it (#1842). A different fault set since stays reported.

#### Parameters

##### reason

`string`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../../managers/BaseManager/classes/default.md#markreadyifdegradedby)

***

### pageAffordance()

> __pageAffordance__(`wikiContext`, `action`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:607

Would the page door allow this action — asked only to decide whether to
SHOW a control (the view's Edit button), never before performing it
(#1668). The page analogue of `holdsPermission` / `pdp.holds`: an
affordance, which a door never asks.

The same evaluator as [checkPagePermissionWithContext](#checkpagepermissionwithcontext), so the two
always agree on allow/deny for the same subject and page. What it does not
do is record: no audit record and no info log line. Showing a control is
not an attempt, and recording it wrote an `authorization-deny` for every
anonymous page view. Acting on the control goes through the door, which
records a refusal.

#### Parameters

##### wikiContext

`WikiContext`

The request's context, holding the page and its metadata

##### action

`string`

Page action (view, edit, delete, rename, upload)

#### Returns

`Promise`\<`boolean`\>

True if the door would allow the action

***

### pageAffordanceFor()

> __pageAffordanceFor__(`caller`, `pageName`, `action`, `knownMetadata?`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyInformationPoint.ts:1009

[canUserAccessPage](#canuseraccesspage) as an affordance (#1668): would the door allow
this action on that page — asked only to decide whether to show a control
(the journal entry view's Edit link, `<wiki:If exists:>`). The same
cross-page path and the same evaluator, so it agrees with the door; it
records nothing. Acting on the control asks the door.

#### Parameters

##### caller

`PageQuestionCaller`

##### pageName

`string`

##### action

`string`

##### knownMetadata?

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md)

As for [canUserAccessPage](#canuseraccesspage): the page's
  metadata when the caller has just resolved it (`PageManager.mayShowPage`).

#### Returns

`Promise`\<`boolean`\>

***

### pageAttributes()

> __pageAttributes__(`caller`, `pageName`, `knownMetadata?`): `Promise`\<[`PageAttributes`](../interfaces/PageAttributes.md)\>

Defined in: src/security/PolicyInformationPoint.ts:1281

A page's attributes for the policies (#2255, XACML's PIP): the PDP asks
this from the page id, so no route passes them. `knownMetadata` is the
frontmatter when this PIP already holds it (the page door); otherwise the
page is read with the caller's own context, so a sealed page stays closed
to anyone without its key (#1422). A page that cannot be read has no
attributes: no category policy matches it and every condition on it is
unknown.

#### Parameters

##### caller

`PageQuestionCaller`

##### pageName

`string`

##### knownMetadata?

`Record`\<`string`, `unknown`\> \| `null`

#### Returns

`Promise`\<[`PageAttributes`](../interfaces/PageAttributes.md)\>

***

### pageAttributesFrom()

> __pageAttributesFrom__(`pageName`, `metadata`): [`PageAttributes`](../interfaces/PageAttributes.md)

Defined in: src/security/PolicyInformationPoint.ts:1305

[pageAttributes](#pageattributes) from frontmatter already in hand (the list
filter). Attributes are those declared on the `page` resource type in
`ngdpbase.access.resource-types`, each read from its `from` source; the
sources are code (`frontmatter:<field>` today).

- `system-category` is lowercased; a page with none is in the default
  category (the entry with `default: true`); a page in a shared folder is
  `shared`, whatever its frontmatter says (#2255).
- An `identity` attribute (`owner`, from `author`) is compared by the
  account it names: an

#### Parameters

##### pageName

`string`

##### metadata

[`PageFrontmatter`](../../../types/Page/interfaces/PageFrontmatter.md) \| `null` \| `undefined`

#### Returns

[`PageAttributes`](../interfaces/PageAttributes.md)

#### Id

or a username not yet converted both read as
  that account's username, an orphan as missing (#2097).

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

Defined in: src/managers/BaseManager.ts:495

Preflight a configured filesystem path before any mkdir/write happens.

Wraps `checkConfiguredPath()` with a standardized warning log that names
the manager (`this.constructor.name`) and the originating config key.
Useful for paths that may live on volumes the OS has unmounted (notably
macOS `/Volumes/<X>/...`), where `fs.ensureDir` would otherwise crash
the engine with an opaque `EACCES`.

The caller decides what to do on failure (degrade, fall back to a
default, or treat as fatal).

#### Parameters

##### configKey

`string`

The config key that supplied this path — included in
                  the warning so operators know what to fix.

##### path

`string` \| `null` \| `undefined`

The resolved path to check.

##### options?

[`PathPreflightOptions`](../../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../../utils/PathPreflight/interfaces/PathPreflightResult.md)

The preflight result. `result.ok === true` means safe
                  to proceed.

#### Example

```ts
const preflight = this.preflightConfiguredPath(
  'ngdpbase.backup.directory',
  this.backupDirectory
);
if (!preflight.ok) {
  // degrade — disable feature, fall back to default, etc.
  return;
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`preflightConfiguredPath`](../../../managers/BaseManager/classes/default.md#preflightconfiguredpath)

***

### recordPageRefusal()

> __recordPageRefusal__(`subject`, `pageName`, `action`, `reason`, `policyIds?`, `conditionNotMet?`): `Promise`\<`void`\>

Defined in: src/security/PolicyInformationPoint.ts:1554

Record a page write a door refused on a capability alone (#2272): the
route's `page-edit` / `page-create` check asks the PDP, which records
nothing. Same record as every other page denial, `policyIds` included.

#### Parameters

##### subject

`UserContext` \| `null` \| `undefined`

##### pageName

`string`

##### action

`string`

##### reason

`string`

##### policyIds?

readonly `string`[] = `[]`

##### conditionNotMet?

readonly `string`[] = `[]`

#### Returns

`Promise`\<`void`\>

***

### recordRouteRefusal()

> __recordRouteRefusal__(`subject`, `route`): `Promise`\<`void`\>

Defined in: src/security/PolicyInformationPoint.ts:1565

Record a write the signed-out write gate refused before any route ran
(#2298). The resource is the route as asked (`POST /save/Home`): method
and path, never the query or the body, which can carry a password or a
token. Standard tier and best-effort, like every other denial.

#### Parameters

##### subject

`UserContext` \| `null` \| `undefined`

##### route

`string`

#### Returns

`Promise`\<`void`\>

***

### resolveSubjectNow()

> __resolveSubjectNow__(`username`, `job?`): `Promise`\<`UserContext`\>

Defined in: src/security/PolicyInformationPoint.ts:365

Resolve a named user's CURRENT roles for a permission decision (#631).

Used when a subject arrives without roles — a background job asking
"what may my requester do, now?". An unknown, inactive or absent user
resolves to the anonymous subject: the job then holds exactly what a
visitor holds, which is the safe answer for someone who no longer exists.

#### Parameters

##### username

`string` \| `undefined`

##### job?

`string`

#### Returns

`Promise`\<`UserContext`\>

***

### restore()

> __restore__(`backupData`, `_options?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:691

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

##### \_options?

[`ManagerRestoreOptions`](../../../managers/BaseManager/interfaces/ManagerRestoreOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

If restore operation fails or backup data is missing

#### Example

```ts
async restore(backupData: BackupData): Promise<void> {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup data');
  }
  this.users = new Map(backupData.data.users.map(u => [u.id, u]));
  this.settings = backupData.data.settings;
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`restore`](../../../managers/BaseManager/classes/default.md#restore)

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/BaseManager.ts:707

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`restoreIsStaged`](../../../managers/BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`safeGetManagerStats`](../../../managers/BaseManager/classes/default.md#safegetmanagerstats)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:638

Shutdown the manager and cleanup resources

Override this method in subclasses to perform cleanup logic.
Always call super.shutdown() at the end of overridden implementations.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async shutdown(): Promise<void> {
  // Your cleanup logic here
  await this.closeConnections();
  await super.shutdown();
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`shutdown`](../../../managers/BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../../managers/BaseManager/classes/default.md#stagedrestoreatstart)

***

### subjectAttribute()

> __subjectAttribute__(`subject`, `name`): `unknown`

Defined in: src/security/PolicyInformationPoint.ts:1339

A subject attribute a condition reads (#2255, #2261): `subject:<name>`,
declared in `ngdpbase.access.subject-attributes` (`id` always is) and read
from its `from` source here, the only place a subject attribute is read. A
request cannot send one. Missing when it is not declared, cannot be read, or
the subject has none (`subject:aal` of a visitor who is not signed in, of a
token made before it was stored); the evaluator then fails closed. Returns
the value, or a Promise of it for a field read from the account (the
evaluator awaits every read).

#### Parameters

##### subject

[`SubjectFacts`](../type-aliases/SubjectFacts.md) \| `null` \| `undefined`

##### name

`string`

#### Returns

`unknown`

***

### subjectEnabledAddons()

> __subjectEnabledAddons__(`ctx`): `Promise`\<`string`[]\>

Defined in: src/security/PolicyInformationPoint.ts:464

The subject's per-person add-ons that are turned on (#1963): an attribute
the PIP supplies to a decision (the page audience `addon:<slug>`, #1964)
the way it supplies roles from RoleManager. AddonsManager owns the answer;
none when it is not running.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`[]\>

***

### subjectFor()

> __subjectFor__(`username`): `Promise`\<`UserContext` \| `null`\>

Defined in: src/security/PolicyInformationPoint.ts:344

An active account as a subject: its record, and the roles it holds NOW.
`null` when there is no such account or it is inactive — the caller
decides what that means (usually the anonymous subject).

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`UserContext` \| `null`\>

***

### systemPrincipalName()

> __systemPrincipalName__(): `string`

Defined in: src/security/PolicyInformationPoint.ts:314

The name of the system principal — the server acting for itself at boot
and from timers (#631).

Owned by the environment: `ngdpbase.system.principal` ships as the bare
env-ref `$NGDPBASE_SYSTEM_USER`, which THROWS when the variable is unset,
so an instance with no named principal refuses to boot rather than
acting as a default nobody chose. `.env` is not reachable from the admin
UI, so the identity cannot be renamed through a form.

#### Returns

`string`

***

### systemSubject()

> __systemSubject__(): `UserContext`

Defined in: src/security/PolicyInformationPoint.ts:331

The system principal as a permission subject (#631).

Identity from `.env`; authority from the role catalog — `ngdpbase.system.roles`,
`["admin"]` by default — evaluated by policy through the same door as any
request (P2). Nothing here is a grant: the roles are read, not asserted.
The name is reserved in `UserManager.createUser`, so no person can hold it.

#### Returns

`UserContext`

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

Defined in: src/managers/BaseManager.ts:758

Return the choices for a form dropdown, for the forms add-on's
`"optionsSource": "fetch:ManagerName.toFormOptions(list=funds)"`.

The same convention and the same safety rules as `toMarqueeText()`: it is
the one other method page content may reach (`resolveManagerOptions`), it
runs on every render for every viewer, and it must have no side effect.
Offer only what `_viewer` may see. The forms add-on calls it again when the
form is submitted and refuses a value that is not among the choices.

#### Parameters

##### \_options?

`Record`\<`string`, `string`\> = `{}`

Parsed args from the spec, as raw `{ key: value }` strings.

##### \_viewer?

`unknown`

The viewer's context.

#### Returns

`Promise`\<[`FormOption`](../../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`toFormOptions`](../../../managers/BaseManager/classes/default.md#toformoptions)

***

### toMarqueeText()

> __toMarqueeText__(`_options?`, `_viewer?`): `Promise`\<`string`\>

Defined in: src/managers/BaseManager.ts:740

Return a plain-text string suitable for use as MarqueePlugin banner text.

Override in subclasses to expose live manager data as a scrolling banner:

  [{MarqueePlugin fetch='PageManager.toMarqueeText()'}]
  [{MarqueePlugin fetch='PageManager.toMarqueeText(limit=5,sort=date-desc)'}]

The default returns '' (no output). Subclasses should return a concise,
single-line summary. Common options (limit, sortBy, sortOrder, since, before)
are available via ManagerFetchOptions; domain-specific keys are read directly
from the raw options object passed by the caller.

#### Parameters

##### \_options?

[`ManagerFetchOptions`](../../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

Parsed fetch args from the plugin invocation.

##### \_viewer?

`unknown`

The viewer's context (#1556): show only what they may see.
                 Page text reaches this method, and only this method, on
                 every render for every viewer.

#### Returns

`Promise`\<`string`\>

Plain text, or '' if this manager has nothing to display.

#### Example

```ts
async toMarqueeText(options: ManagerFetchOptions = {}): Promise<string> {
  const pages = await this.getRecentChanges(options.limit ?? 5);
  return 'Recent: ' + pages.map(p => p.name).join('  •  ');
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`toMarqueeText`](../../../managers/BaseManager/classes/default.md#tomarqueetext)
