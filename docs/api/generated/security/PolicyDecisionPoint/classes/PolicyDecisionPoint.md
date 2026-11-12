[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/PolicyDecisionPoint](../README.md) / PolicyDecisionPoint

# Class: PolicyDecisionPoint

Defined in: src/security/PolicyDecisionPoint.ts:110

## Extends

- [`default`](../../../managers/BaseManager/classes/default.md)

## Constructors

### Constructor

> __new PolicyDecisionPoint__(`engine`): `PolicyDecisionPoint`

Defined in: src/security/PolicyDecisionPoint.ts:116

A manager so every PEP can reach it through `engine.getManager`, the same
way it reaches anything else. It holds no state of its own: a decision is
derived, never stored.

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`PolicyDecisionPoint`

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

### adminMayEnterVault()

> __adminMayEnterVault__(`ctx`, `owner`, `vault`, `resource`, `record?`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyDecisionPoint.ts:753

May an administrator enter `owner`'s vault (#2255,
`ngdpbase.vaults.admin-access`)? Asked only after the container rule has
refused someone who is not the owner. Yes when all hold:

- the key is true, read now, on every request (shipped true);
- the caller is a signed-in session or a job, not a share link, a proxy
  or an agent token;
- the caller holds `admin-system`;
- the vault is not encrypted: an encrypted vault always needs its key,
  whatever the key says, so it is not entered at all.

`record` true (a door) writes `vault-admin-access` with the administrator
as the actor and the owner, vault and page named; an affordance passes
false and records nothing. Lists and search never ask this, so an
administrator does not see other people's vault pages listed.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md) \| `null` \| `undefined`

##### owner

`string`

##### vault

`string`

##### resource

`string`

##### record?

`boolean` = `true`

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

### categoriesGranting()

> __categoriesGranting__(`action`): `string`[]

Defined in: src/security/PolicyDecisionPoint.ts:1020

#### Parameters

##### action

`string`

#### Returns

`string`[]

***

### ceiling()

> __ceiling__(`subject`, `request`): `Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md) \| `null`\>

Defined in: src/security/PolicyDecisionPoint.ts:433

The delegation ceilings alone: does the token's scope, the share's grant,
or the proxy grant (#1762, proxyCeiling) permit this at all?

Returns `null` when the caller carries no delegation — there is nothing to
bound, and the answer is whatever policy says.

The refusal reasons are the vocabulary already recorded by
`PolicyInformationPoint.logAccessDecision` — `token_scope_deny`, `share_action_deny`,
`share_expired`, `share_resource_deny`, `share_issuer_deny`, and for a
proxy `proxy_combined_deny`, `proxy_kind_deny`, `proxy_revoked`,
`proxy_scope_deny`, `proxy_actor_deny` — because they
land in the audit trail, and renaming one silently changes what an
assessor reads.

Separate from [decide](#decide) because a caller sometimes needs ONLY this.
`filterAccessiblePages` bounds the subject once and then applies each
page's own rules; running a full decision there would refuse the whole
list on a global policy that the page's frontmatter or ACL markup would
have overridden.

#### Parameters

##### subject

[`PermissionSubject`](../../../managers/UserManager/interfaces/PermissionSubject.md) \| [`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md) \| `null` \| `undefined`

##### request

[`DecisionRequest`](../../../types/Policy/interfaces/DecisionRequest.md)

#### Returns

`Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md) \| `null`\>

***

### decide()

> __decide__(`subject`, `request`): `Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

Defined in: src/security/PolicyDecisionPoint.ts:585

Decide. The order is load-bearing:

1. __The ceilings__ (see [ceiling](#ceiling)), before anything else. A
   delegated credential may only ever exercise a subset of what was
   delegated, whatever policy says (#946, #1222); a proxy only what its
   grant carries and its actor holds, and then policy for the person
   represented (#1762).
2. __A share IS the policy__ for a capability check, so a passing share
   returns an allow rather than falling through to the evaluator — a share
   must work on an instance whose policy grants anonymous nothing.
3. __Roles resolved live__ when the subject asks for it (`resolveRolesNow`),
   so a job authorises against the roles its principal holds at decision
   time, not at enqueue time (#631, #1212).
4. __The policies__, through `PolicyEvaluator`.

#### Parameters

##### subject

`DecisionInput`

##### request

[`DecisionRequest`](../../../types/Policy/interfaces/DecisionRequest.md)

#### Returns

`Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

***

### decideOwnedList()

> __decideOwnedList__(`input`, `request`): `Promise`\<[`OwnedListDecision`](../../ownedRecords/type-aliases/OwnedListDecision.md)\>

Defined in: src/security/PolicyDecisionPoint.ts:839

May this subject list a type, and which rows (#1823)?

An allow for a type that declares `owner` carries one filter, `owner`
equals the subject's identity @id. The manager binds that value; it is
not SQL. An allow for a type with no owner carries an empty filter: policy
alone, no row constraint. A refusal is `{ decision: 'deny' }`, never an
empty filter and never an empty row set from this method. Missing data
throws [OwnedRecordError](../../ownedRecords/classes/OwnedRecordError.md). This records nothing: the list is logged
once by the manager that applies it.

#### Parameters

##### input

`DecisionInput`

##### request

[`OwnedListAsk`](../../ownedRecords/interfaces/OwnedListAsk.md)

#### Returns

`Promise`\<[`OwnedListDecision`](../../ownedRecords/type-aliases/OwnedListDecision.md)\>

***

### decideOwnedRecord()

> __decideOwnedRecord__(`input`, `request`): `Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

Defined in: src/security/PolicyDecisionPoint.ts:800

May this subject act on one stored add-on record (#1823)?

The manager passes attributes it read from the row. `owner` is the
identity @id. A type that declares `owner` is allowed only when that

#### Parameters

##### input

`DecisionInput`

##### request

[`OwnedRecordAsk`](../../ownedRecords/interfaces/OwnedRecordAsk.md)

#### Returns

`Promise`\<[`Decision`](../../../types/Policy/interfaces/Decision.md)\>

#### Id

is the subject's (the person a proxy grant represents, not the actor),
and policy also allows the action. A role does not bypass the owner. A
type with no `owner` is policy alone. A core type (`page`, `vault`, …)
is not decided here. Missing data throws [OwnedRecordError](../../ownedRecords/classes/OwnedRecordError.md); the
caller fails closed. This records nothing.

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

### getUserGrants()

> __getUserGrants__(`username`): `Promise`\<[`RoleGrant`](../../../utils/roleGrants/interfaces/RoleGrant.md)[]\>

Defined in: src/security/PolicyDecisionPoint.ts:386

[getUserPermissions](#getuserpermissions) with where each applies (#1539) — for the profile.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`RoleGrant`](../../../utils/roleGrants/interfaces/RoleGrant.md)[]\>

***

### getUserPermissions()

> __getUserPermissions__(`username`): `Promise`\<`string`[]\>

Defined in: src/security/PolicyDecisionPoint.ts:381

The permissions a user's roles give them, for display (#1431 step 10).

The union of their roles' rows in the admin Security Policy Summary, read
live from the policies — so the profile page and the admin page can never
disagree. A summary for a human, not an authorisation answer: that is
always [permits](#permits) with the subject.

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`string`[]\>

***

### grantsForRoles()

> __grantsForRoles__(`roles`): [`RoleGrant`](../../../utils/roleGrants/interfaces/RoleGrant.md)[]

Defined in: src/security/PolicyDecisionPoint.ts:213

What the given roles grant together, each with where it applies (#1539):
an action is limited only when every role granting it is limited, and
`where` collects the places those limited grants name — so `vault-owner`'s
actions read "in your own vaults". A summary, never an answer.

#### Parameters

##### roles

readonly `string`[]

#### Returns

[`RoleGrant`](../../../utils/roleGrants/interfaces/RoleGrant.md)[]

***

### holds()

> __holds__(`subject`, `action`, `on?`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyDecisionPoint.ts:292

Does the subject HOLD this permission (#1635)? Policy alone — the
step-up freshness rule is not applied. A different question from
[permits](#permits), which is "may it act now", and named so: an affordance
(show the reveal button, show the sign-in methods section) asks this, so a
person whose sign-in is not fresh still sees the way to the prompt that
makes it fresh. A door never asks this. `on` asks it about a resource,
as [decide](#decide) does (#2120: a vault page's export).

#### Parameters

##### subject

`DecisionInput`

##### action

`string`

##### on?

`Omit`\<[`DecisionRequest`](../../../types/Policy/interfaces/DecisionRequest.md), `"action"`\> = `{}`

#### Returns

`Promise`\<`boolean`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:371

Initialize the manager with configuration

Override this method in subclasses to perform initialization logic.
Always call super.initialize() first in overridden implementations.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object

#### Returns

`Promise`\<`void`\>

#### Example

```ts
async initialize(config: Record<string, any> = {}): Promise<void> {
  await super.initialize(config);
  // Your initialization logic here
  console.log('MyManager initialized');
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`initialize`](../../../managers/BaseManager/classes/default.md#initialize)

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

### namesJob()

> __namesJob__(`jobId`): `boolean`

Defined in: src/security/PolicyDecisionPoint.ts:181

Whether a policy in force names the scheduled job `jobId` as a subject
(`{ "type": "job", "value": jobId }`, #1999), allow or deny. When one
does, the job's runs act as the job itself; when none does, as the system
principal. Read live, so a site that removes the policy gives the job the
system roles back at its next decision.

#### Parameters

##### jobId

`string`

#### Returns

`boolean`

***

### permissionsForRoles()

> __permissionsForRoles__(`roles`): `string`[]

Defined in: src/security/PolicyDecisionPoint.ts:239

Everything the given roles permit together, sorted: the union of their
rows in [rolePermissions](#rolepermissions), so a user's own list is exactly what the
admin summary shows for the roles they hold. A summary, never an answer.

#### Parameters

##### roles

readonly `string`[]

#### Returns

`string`[]

***

### permits()

> __permits__(`subject`, `action`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyDecisionPoint.ts:279

Authorise a request: may THIS subject perform `action`? The boolean form
of [decide](#decide) for a capability. It was `UserManager.hasPermission`
until #1431 step 14; the decision was already here, only the door moved.

Takes the caller's context as it was given (#2022): a `PermissionSubject`
— the request's own identity, forwarded from `req.userContext`
(WikiContext, ApiContext, ParseContext), roles already resolved by the
session middleware — or a `JobContext` for work with no request (#631),
which the PDP turns into a subject itself. Never convert one first.

# 1173 Part B: the username-string overload this method once accepted is
gone. A string cannot carry `viaToken`, so the agent-token ceiling below
had nothing to read and every string-form call resolved against the
owner's full roles. There is one path now, and the type makes the other
impossible. Callers with no subject to hand over have one of two
legitimate shapes: `ANONYMOUS_SUBJECT`, or the
separate question [userHoldsPermission](#userholdspermission) — "does the named user hold
this?" — which is a lookup about somebody else, not an authorisation.

#### Parameters

##### subject

`DecisionInput`

The caller's context: the request's subject, with
                 `viaToken` present when a bearer token authenticated it,
                 or a job's context.

##### action

`string`

Action/permission to check (e.g., 'page-create', 'user-read')

#### Returns

`Promise`\<`boolean`\>

True if the subject may perform the action under current policy

***

### policies()

> __policies__(): [`Policy`](../../../types/Policy/interfaces/Policy.md)[]

Defined in: src/security/PolicyDecisionPoint.ts:159

The policies in force right now, in configuration order. Order carries no
meaning: the rule-combining algorithm is `deny-overrides` (#2330).

- `ngdpbase.access.policies.enabled` false — its default when unset —
  means none;
- an entry without a string `id` is not a policy, and is skipped;
- two entries with the same `id` are both kept. Merging `id` arrays by id
  is the configuration merge's rule (between the layers), and within one
  layer a duplicate is an authoring error that `PolicyValidator` reports —
  not something to resolve silently here.

#### Returns

[`Policy`](../../../types/Policy/interfaces/Policy.md)[]

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

### rolePermissionLists()

> __rolePermissionLists__(): `Record`\<`string`, `string`[]\>

Defined in: src/security/PolicyDecisionPoint.ts:228

[rolePermissions](#rolepermissions) as plain sorted arrays — for template data and JSON.

#### Returns

`Record`\<`string`, `string`[]\>

***

### rolePermissions()

> __rolePermissions__(): `Map`\<`string`, `Set`\<`string`\>\>

Defined in: src/security/PolicyDecisionPoint.ts:198

What each role permits: role name → the actions its holders are granted.

It mirrors the evaluator's ROLE matching — an allow policy naming a role
grants its actions, a deny policy naming it takes them away, whatever the
order (deny-overrides, #2330). It does not
evaluate resource patterns or the ceilings, so it is a summary for a human
reading a table (the admin Security Policy Summary, a profile), never an
authorisation answer — that is [permits](#permits) with the caller's subject.

Each role used to carry an inline `permissions[]` display copy kept
matched by hand (#713); this derives the table from the policies instead.

#### Returns

`Map`\<`string`, `Set`\<`string`\>\>

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

***

### userHoldsPermission()

> __userHoldsPermission__(`username`, `action`): `Promise`\<`boolean`\>

Defined in: src/security/PolicyDecisionPoint.ts:339

Does this NAMED USER hold a permission? (#1173)

A different question from [permits](#permits), and that is why it has a
different name. This one __inspects a user__ — "does bob hold
`admin-system`?" — where there is no request, no token, and nothing to cap.
`permits` __authorises a request__, so it must be handed the subject the
request carries or an agent token's scope ceiling has nothing to read.

They shared a name and one of them took a bare string, which is how #1164
happened seventeen times. Splitting them means the dangerous question
cannot be asked by accident. The subject is the PIP's, resolved live.

#### Parameters

##### username

`string`

##### action

`string`

#### Returns

`Promise`\<`boolean`\>

***

### usersHolding()

> __usersHolding__(`action`): `Promise`\<`string`[] \| `null`\>

Defined in: src/security/PolicyDecisionPoint.ts:363

The usernames of every account that holds a permission, each asked through
[userHoldsPermission](#userholdspermission) (#1813; was `utils/administrators.ts`). With
`admin-system` this is "who are the administrators": the people an
operator problem is reported to (#1431 7b, #1916), never a role name.

An empty answer means "nobody to tell", and a caller sending a
notification must then only log it: an empty `targetUsers` list means
every user in NotificationManager.

#### Parameters

##### action

`string`

#### Returns

`Promise`\<`string`[] \| `null`\>

The usernames, or null when there is no UserManager to list
  accounts from (tests, a half-booted engine); treat that like nobody
