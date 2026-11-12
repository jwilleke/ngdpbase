[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / default

# Class: default

Defined in: src/managers/PolicyEvaluator.ts:456

PolicyEvaluator - Evaluates access policies against a given context.

PolicyEvaluator mimics how JSPWiki uses Java's built-in security framework
(java.security) to load and evaluate security policies from a policy file.
Among the policies that match, a deny overrides any allow, the
rule-combining algorithm `deny-overrides` (#2330), and no match is a deny (#2255). Each decision names the policies
that decided it.

 PolicyEvaluator

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- [PolicyDecisionPoint.policies](../../../security/PolicyDecisionPoint/classes/PolicyDecisionPoint.md#policies) for how the policies are read
- PolicyInformationPoint for access control integration

## Example

```ts
const evaluator = engine.getManager('PolicyEvaluator');
const result = await evaluator.evaluateAccess({
  pageName: 'Main',
  action: 'page:read',
  userContext: { username: 'admin', roles: ['admin'] }
});
if (result.allowed) console.log('Access granted');
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `PolicyEvaluator`

Defined in: src/managers/PolicyEvaluator.ts:488

Creates a new PolicyEvaluator instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`PolicyEvaluator`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`constructor`](../../BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`description`](../../BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(`_options?`): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BaseManager.ts:663

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Parameters

##### \_options?

[`ManagerBackupOptions`](../../BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

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

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

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

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### compile()

> __compile__(`userContext`, `action`, `actions?`): (`pageName`, `attributes?`, `readAttribute?`) => `Promise`\<`EvaluationResult`\>

Defined in: src/managers/PolicyEvaluator.ts:879

`evaluateAccess` with the subject and the action fixed (#1219) — rule 10's
`filter` shape, compiled once and applied to many resources.

Policies that cannot match this subject or this action are dropped here,
once; the predicate matches resources only and combines them exactly as
`evaluateAccess` does (deny overrides allow, #2255), so a list and a
single decision agree. No log line per call: a listing asks this ~18k
times, and the INFO line `evaluateAccess` writes is right for one
decision and wrong for a filter.

#### Parameters

##### userContext

`UserContext` \| `undefined`

##### action

`string`

##### actions?

readonly `string`[] = `...`

#### Returns

(`pageName`, `attributes?`, `readAttribute?`) => `Promise`\<`EvaluationResult`\>

***

### conditionProblemsInForce()

> __conditionProblemsInForce__(): `object`[]

Defined in: src/managers/PolicyEvaluator.ts:965

Each policy in force whose condition has a problem, with the problems (#2255): for the boot warning.

#### Returns

`object`[]

***

### declaredEnvironmentAttributes()

> __declaredEnvironmentAttributes__(): `Record`\<`string`, [`DeclaredEnvironmentAttribute`](../../../utils/policyAttributes/interfaces/DeclaredEnvironmentAttribute.md)\>

Defined in: src/managers/PolicyEvaluator.ts:907

The environment attributes a condition may read (#2261): those declared in `ngdpbase.access.environment-attributes`.

#### Returns

`Record`\<`string`, [`DeclaredEnvironmentAttribute`](../../../utils/policyAttributes/interfaces/DeclaredEnvironmentAttribute.md)\>

***

### declaredPageAttributes()

> __declaredPageAttributes__(): `Record`\<`string`, \{ `type?`: `string`; \}\>

Defined in: src/managers/PolicyEvaluator.ts:895

The attributes declared on the `page` resource type (#2255), for checking a condition.

#### Returns

`Record`\<`string`, \{ `type?`: `string`; \}\>

***

### declaredSubjectAttributes()

> __declaredSubjectAttributes__(): `Record`\<`string`, [`DeclaredSubjectAttribute`](../../../utils/policyAttributes/interfaces/DeclaredSubjectAttribute.md)\>

Defined in: src/managers/PolicyEvaluator.ts:902

The subject attributes a condition may read (#2261): `id` always, and those declared in `ngdpbase.access.subject-attributes`.

#### Returns

`Record`\<`string`, [`DeclaredSubjectAttribute`](../../../utils/policyAttributes/interfaces/DeclaredSubjectAttribute.md)\>

***

### evaluateAccess()

> __evaluateAccess__(`context`): `Promise`\<`EvaluationResult`\>

Defined in: src/managers/PolicyEvaluator.ts:661

Evaluates all relevant policies to make an access decision (#2255).

Deny overrides allow (the rule-combining algorithm, #2330): if any matching
deny applies, the answer is deny; otherwise any matching allow permits;
otherwise no policy decided. A policy with a `condition` applies only when it holds;
an unknown condition (a missing attribute) keeps an allow from applying
and lets a deny apply, so a missing attribute fails closed.

#### Parameters

##### context

`AccessContext`

#### Returns

`Promise`\<`EvaluationResult`\>

***

### evaluateDeclaredResource()

> __evaluateDeclaredResource__(`context`): `Promise`\<`EvaluationResult`\>

Defined in: src/managers/PolicyEvaluator.ts:724

Decide one add-on record type by id (#1823).

Only policies that name this type are considered, and a policy with no
resources does not match: a page grant cannot cover the type, and a
blanket policy cannot either. The id is matched with the same globs as a
page name, a leading dot included. A core type (`page`, `system-category`, `vault`,
`shared-folder`) is not decided here.

#### Parameters

##### context

###### action

`string`

###### actions?

readonly `string`[]

###### id

`string`

###### readAttribute?

[`AttributeReader`](../type-aliases/AttributeReader.md)

###### resourceType

`string`

###### userContext?

`UserContext`

#### Returns

`Promise`\<`EvaluationResult`\>

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

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

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

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStats`](../../BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`getManagerStatus`](../../BaseManager/classes/default.md#getmanagerstatus)

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/managers/PolicyEvaluator.ts:503

Initializes the PolicyEvaluator by getting its reference to ConfigurationManager

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available

#### Example

```ts
await evaluator.initialize();
console.log('Policy evaluator ready');
```

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

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

[`default`](../../BaseManager/classes/default.md).[`invalidateHandlerCache`](../../BaseManager/classes/default.md#invalidatehandlercache)

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

[`default`](../../BaseManager/classes/default.md).[`isInitialized`](../../BaseManager/classes/default.md#isinitialized)

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

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markDegraded`](../../BaseManager/classes/default.md#markdegraded)

***

### markDenyChecked()

> __markDenyChecked__(`ctx`, `id`, `fingerprint`): `Promise`\<`"checked"` \| `"changed"` \| `"missing"`\>

Defined in: src/managers/PolicyEvaluator.ts:641

An administrator marks a deny as checked (#2355). Kept as the rule's id and a fingerprint of
its content in `ngdpbase.access.checked-denies`, written through ConfigurationManager with the
person's context, which records the change. It hides the item and nothing else: no decision
reads it. Answers `changed` when the rule is no longer what the page showed (nothing is
saved) and `missing` when no deny has that id.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### id

`string`

##### fingerprint

`string`

#### Returns

`Promise`\<`"checked"` \| `"changed"` \| `"missing"`\>

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

[`default`](../../BaseManager/classes/default.md).[`markDisabled`](../../BaseManager/classes/default.md#markdisabled)

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

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markFailed`](../../BaseManager/classes/default.md#markfailed)

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

[`AttentionOptions`](../../BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`markNeedsAttention`](../../BaseManager/classes/default.md#markneedsattention)

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

[`default`](../../BaseManager/classes/default.md).[`markReady`](../../BaseManager/classes/default.md#markready)

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

[`default`](../../BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../BaseManager/classes/default.md#markreadyifdegradedby)

***

### matches()

> __matches__(`policy`, `context`): `boolean`

Defined in: src/managers/PolicyEvaluator.ts:797

Checks if a single policy matches the given context.

A policy matches if ALL of the following conditions are true:

- Subject matches (user has required role)
- Resource matches (page name matches pattern)
- Action matches (action is in policy's action list)

#### Parameters

##### policy

[`Policy`](../../../types/Policy/interfaces/Policy.md)

The policy to check

##### context

`AccessContext`

The access request context

#### Returns

`boolean`

True if the policy matches, false otherwise

#### Example

```ts
const matches = evaluator.matches(policy, context);
if (matches) console.log('Policy applies to this request');
```

***

### matchesAction()

> __matchesAction__(`actions`, `action`): `boolean`

Defined in: src/managers/PolicyEvaluator.ts:1013

Checks if the action matches the policy's actions.

An action matches if:

- No actions specified (applies to all actions), OR
- Action is in the policy's action list, OR
- Policy includes wildcard '*' (matches all actions)

#### Parameters

##### actions

`string`[] \| `undefined`

The actions array from the policy

##### action

`string`

The action being performed

#### Returns

`boolean`

True if the action is in the policy's list

#### Example

```ts
const matches = evaluator.matchesAction(
  ['page:read', 'page:edit'],
  'page:read'
);
// matches === true
```

***

### matchesResource()

> __matchesResource__(`resources`, `pageName`, `attributes?`): `boolean`

Defined in: src/managers/PolicyEvaluator.ts:977

#### Parameters

##### resources

[`PolicyResource`](../../../types/Policy/interfaces/PolicyResource.md)[] \| `undefined`

##### pageName

`string`

##### attributes?

[`ResourceAttributes`](../type-aliases/ResourceAttributes.md)

#### Returns

`boolean`

***

### matchesSubject()

> __matchesSubject__(`policySubjects`, `userContext`): `boolean`

Defined in: src/managers/PolicyEvaluator.ts:824

Check if the user context's roles match the policy's subject requirements.

A user matches if:

- No subjects specified (applies to everyone), OR
- Policy includes "All" role (applies to everyone), OR
- User has at least one role matching a policy subject

#### Parameters

##### policySubjects

[`PolicySubject`](../../../types/Policy/interfaces/PolicySubject.md)[] \| `undefined`

The subjects array from the policy

##### userContext

`UserContext` \| `undefined`

The user's context

#### Returns

`boolean`

True if the user matches the policy subjects

#### Example

```ts
const matches = evaluator.matchesSubject(
  [{ type: 'role', value: 'admin' }],
  { username: 'user', roles: ['admin', 'editor'] }
);
// matches === true
```

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

[`default`](../../BaseManager/classes/default.md).[`preflightConfiguredPath`](../../BaseManager/classes/default.md#preflightconfiguredpath)

***

### restore()

> __restore__(`backupData`, `_options?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:691

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

##### \_options?

[`ManagerRestoreOptions`](../../BaseManager/interfaces/ManagerRestoreOptions.md)

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

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

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

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`safeGetManagerStats`](../../BaseManager/classes/default.md#safegetmanagerstats)

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

[`default`](../../BaseManager/classes/default.md).[`shutdown`](../../BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../BaseManager/classes/default.md#stagedrestoreatstart)

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

[`default`](../../BaseManager/classes/default.md).[`toFormOptions`](../../BaseManager/classes/default.md#toformoptions)

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

[`default`](../../BaseManager/classes/default.md).[`toMarqueeText`](../../BaseManager/classes/default.md#tomarqueetext)
