[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuditManager](../README.md) / default

# Class: default

Defined in: src/managers/AuditManager.ts:246

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `AuditManager`

Defined in: src/managers/AuditManager.ts:256

Creates a new AuditManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`AuditManager`

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

### authenticationRecord()

> __authenticationRecord__(`id`): `Promise`\<[`AuthenticationRecordSummary`](../interfaces/AuthenticationRecordSummary.md) \| `null`\>

Defined in: src/managers/AuditManager.ts:728

The `authentication-success` record with this id, or null (#1523): a
remembered browser counts only while the record of the sign-in that
remembered it says the same as its row. Only the fields that check needs
leave this method, so it is not an audit query and asks no caller; a
record of any other kind is null. Null too when the provider cannot look
a record up by id.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`AuthenticationRecordSummary`](../interfaces/AuthenticationRecordSummary.md) \| `null`\>

***

### backup()

> __backup__(`options?`): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/AuditManager.ts:1105

The audit log in a backup (#1876): the provider's own files beside the
document, with the hash chain they carry (`FileAuditProvider.backupFiles`).
A provider that keeps no files is not in the file backup: the database
provider's records are in the application database, which DatabaseManager
backs up after writing the audit queue (#1537).

#### Parameters

##### options?

[`ManagerBackupOptions`](../../BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

#### Overrides

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

### cleanupOldLogs()

> __cleanupOldLogs__(): `Promise`\<`void`\>

Defined in: src/managers/AuditManager.ts:931

Clean up old audit logs based on retention policy

#### Returns

`Promise`\<`void`\>

***

### degradedReason()

> __degradedReason__(): `string` \| `null`

Defined in: src/managers/AuditManager.ts:414

Why audit is degraded, or null.

#### Returns

`string` \| `null`

***

### exportAuditLogs()

> __exportAuditLogs__(`filters?`, `format?`, `caller?`): `Promise`\<`string`\>

Defined in: src/managers/AuditManager.ts:892

Export audit logs

#### Parameters

##### filters?

`AuditFilters` = `{}`

Export filters

##### format?

`string` = `'json'`

Export format ('json', 'csv')

##### caller?

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

Who is asking (#1116)

#### Returns

`Promise`\<`string`\>

Exported data

***

### flushAuditQueue()

> __flushAuditQueue__(): `Promise`\<`void`\>

Defined in: src/managers/AuditManager.ts:919

Flush audit queue to disk

#### Returns

`Promise`\<`void`\>

***

### getAuditPosture()

> __getAuditPosture__(): `object`

Defined in: src/managers/AuditManager.ts:424

What this instance's auditing actually does right now (#1118).

Reportable rather than inferable: a security property that has to be
deduced from configuration is not one an instance can be assessed on.

#### Returns

`object`

##### configured

> __configured__: `string`

##### degraded

> __degraded__: `boolean`

##### guarantees

> __guarantees__: [`AuditReport`](../../../providers/BaseAuditProvider/interfaces/AuditReport.md) \| `null`

##### provider

> __provider__: `string`

##### reason

> __reason__: `string` \| `null`

***

### getAuditStats()

> __getAuditStats__(`filters?`, `caller?`): `Promise`\<`AuditStats`\>

Defined in: src/managers/AuditManager.ts:876

Get audit statistics

#### Parameters

##### filters?

`AuditFilters` = `{}`

Optional filters

##### caller?

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

#### Returns

`Promise`\<`AuditStats`\>

Audit statistics

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

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/AuditManager.ts:270

Initialize the AuditManager and load the configured provider

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

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

### isDegraded()

> __isDegraded__(): `boolean`

Defined in: src/managers/AuditManager.ts:409

True when audit is configured but not working.

#### Returns

`boolean`

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

### logAccessDecision()

> __logAccessDecision__(`context`, `result`, `reason`, `policy?`): `Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

Defined in: src/managers/AuditManager.ts:625

Log access control decision

#### Parameters

##### context

`AccessContext`

Access context

##### result

`string`

'allow', 'deny', 'error'

##### reason

`string`

Reason for the decision

##### policy?

`PolicyInfo` \| `null` = `null`

Policy that made the decision

#### Returns

`Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

What became of the record (#1205)

***

### logAuditEvent()

> __logAuditEvent__(`auditEvent`): `Promise`\<`string`\>

Defined in: src/managers/AuditManager.ts:583

Log an audit event

#### Parameters

##### auditEvent

`AuditEvent`

Audit event data

#### Returns

`Promise`\<`string`\>

Event ID

***

### logAuthentication()

> __logAuthentication__(`context`, `result`, `reason`): `Promise`\<\{ `id?`: `string`; `outcome`: [`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md); \}\>

Defined in: src/managers/AuditManager.ts:694

Log authentication event

#### Parameters

##### context

`AuthenticationContext`

Authentication context

##### result

`string`

'success', 'failure', 'logout'

##### reason

`string`

Reason for result

#### Returns

`Promise`\<\{ `id?`: `string`; `outcome`: [`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md); \}\>

What became of the record (#1205), and its id when it was
  recorded: a remembered browser's row names its sign-in's record (#1523)

***

### logPolicyEvaluation()

> __logPolicyEvaluation__(`context`, `policies`, `finalResult`, `duration`): `Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

Defined in: src/managers/AuditManager.ts:665

Log policy evaluation

#### Parameters

##### context

`AccessContext`

Evaluation context

##### policies

`PolicyInfo`[]

Policies evaluated

##### finalResult

`string`

Final result

##### duration

`number`

Evaluation duration in ms

#### Returns

`Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

What became of the record (#1205)

***

### logSecurityEvent()

> __logSecurityEvent__(`context`, `eventType`, `severity`, `description`): `Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

Defined in: src/managers/AuditManager.ts:756

Log security event

#### Parameters

##### context

`SecurityContext`

Security context

##### eventType

`string`

Type of security event

##### severity

`"high"` \| `"low"` \| `"medium"` \| `"critical"`

'low', 'medium', 'high', 'critical'

##### description

`string`

Event description

#### Returns

`Promise`\<[`AuditRecordOutcome`](../../../utils/auditEvents/type-aliases/AuditRecordOutcome.md)\>

What became of the record (#1205)

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

### restartAuditChain()

> __restartAuditChain__(`reason`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/AuditManager.ts:453

Begin a new audit chain, recording that the old one was abandoned (#1124).

Exposed so the operator command can reach it. Never called automatically —
a system that silently repairs its own audit chain is worse than one that
stays visibly broken.

#### Parameters

##### reason

`string`

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

***

### restore()

> __restore__(`backupData`, `options?`): `Promise`\<`void`\>

Defined in: src/managers/AuditManager.ts:1129

Staged for the next start with the rest of a site restore (#1876); the
live log keeps recording until then.

A site whose audit provider keeps no files (the database provider, #1537)
stages nothing from a backup's audit files and does not fail the restore:
its audit records are restored with the databases, and the file part is
left out, so BackupManager reports "the audit log" as not restored. The
files stay in the backup.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

##### options?

[`ManagerRestoreOptions`](../../BaseManager/interfaces/ManagerRestoreOptions.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### restoreIsStaged()

> __restoreIsStaged__(): `boolean`

Defined in: src/managers/AuditManager.ts:1146

Whether this manager's `restore()` stages for the next start instead of
writing into the running site (#1723, #1876). BackupManager stages every
such manager in a site restore together, all or nothing, after a backup
of the live data. The default: true when it declares folders or files
(#1985), which BackupManager stages; otherwise false, the restore writes
live.

#### Returns

`boolean`

#### Overrides

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

### searchAuditLogs()

> __searchAuditLogs__(`filters?`, `options?`, `caller?`): `Promise`\<`AuditSearchResults`\>

Defined in: src/managers/AuditManager.ts:821

Search audit logs

#### Parameters

##### filters?

`AuditFilters` = `{}`

Search filters

##### options?

`AuditSearchOptions` = `{}`

Search options

##### caller?

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

Who is asking: the request's subject (the decision is made here)

#### Returns

`Promise`\<`AuditSearchResults`\>

Search results

***

### searchEntriesAbout()

> __searchEntriesAbout__(`person`, `options?`, `caller?`): `Promise`\<`AuditSearchResults`\>

Defined in: src/managers/AuditManager.ts:853

The audit entries about one person, newest first, a page at a time
(#1537): the one audit log, filtered to the rows where the person is the
`user` (the account acted on, or the person represented under a proxy
grant), the `actor` (who actually did it under a proxy grant), or the
owner of the resource the row names (`metadata.owner`: the user's
identity `@id` on rows from #2041 on, their username on older rows).
Nothing is removed from the log by reading it.

Decided by the PDP with the caller's subject: a person asking about
themselves needs `profile-manage` (granted to every account); asking about
anyone else is reading the audit log, `admin-system`. Under a proxy grant
the subject's username is the person represented, and the PDP bounds the
answer by the grant. Refused with [AuditQueryForbiddenError](AuditQueryForbiddenError.md).

#### Parameters

##### person

`string`

The username whose entries are listed

##### options?

`limit` (capped by the provider) and `offset`

###### limit?

`number`

###### offset?

`number`

##### caller?

[`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

Who is asking: the request's subject

#### Returns

`Promise`\<`AuditSearchResults`\>

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/AuditManager.ts:1155

Shutdown the audit manager

#### Returns

`Promise`\<`void`\>

#### Overrides

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
