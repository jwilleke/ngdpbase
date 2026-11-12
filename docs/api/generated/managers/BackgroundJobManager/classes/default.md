[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / default

# Class: default

Defined in: src/managers/BackgroundJobManager.ts:318

BackgroundJobManager — async long-running admin operations.

Managers and plugins register job types at startup via registerJob().
Callers enqueue a job by ID; the job runs in the background and the
caller can poll getStatus(runId) for progress.

Only one instance of a given jobId runs at a time — duplicate enqueue
returns the existing runId.

On completion, a system notification is posted via NotificationManager.

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`, `options?`): `BackgroundJobManager`

Defined in: src/managers/BackgroundJobManager.ts:371

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

##### options?

###### checkpointThrottleMs?

`number`

###### now?

() => `Date`

###### stateProvider?

[`JobStateProvider`](../../../providers/jobState/interfaces/JobStateProvider.md)

#### Returns

`BackgroundJobManager`

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

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BackgroundJobManager.ts:1460

Where job state is when it is not a declared folder: the database, or nowhere while held (#1876).

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

Defined in: src/managers/BackgroundJobManager.ts:1454

File job state (`ngdpbase.jobs.state.dir`) is a declared folder (#1876,
# 1985): the state, run history and checkpoints as `<stem>.jobs.tar`
beside the document, without the slot locks, which belong to the server
that holds them. A backup without it (its job state was in the database)
stages nothing for it. Job state in the database is in the database
backup, and comes back with it.

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### displayNameOf()

> __displayNameOf__(`jobId`): `string`

Defined in: src/managers/BackgroundJobManager.ts:1538

A job's display name, or its id when no job of that id is registered.

#### Parameters

##### jobId

`string`

#### Returns

`string`

***

### enqueue()

> __enqueue__(`jobId`, `requestedBy`): `Promise`\<`string`\>

Defined in: src/managers/BackgroundJobManager.ts:1150

Enqueue a job by ID. Returns the runId immediately.
If the job is already pending/running, returns the existing runId.

__`requestedBy` is mandatory, and positional rather than an option (#631).__
This took a job id alone, so the identity of whoever triggered the work was
discarded here — the route logged the username on the line above and threw
it away on this one. Every defect this codebase has removed lately came
from forgetting being safe; an optional context would be that shape again,
and the first job added without one would go unattributed with nothing
going red. Omitting it is now a compile error.

Build it with `jobContextFromRequest(req.userContext)` when a person asked,
or `jobContextFromSystem(pip.systemPrincipalName(), reason)` (the PolicyInformationPoint's) when
nothing did (#631: the principal is a name from .env, never a constant).

#### Parameters

##### jobId

`string`

##### requestedBy

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`string`\>

#### Throws

Error if jobId is not registered

***

### getActiveJobs()

> __getActiveJobs__(): [`JobRun`](../interfaces/JobRun.md)[]

Defined in: src/managers/BackgroundJobManager.ts:1564

Get all currently pending or running jobs.

#### Returns

[`JobRun`](../interfaces/JobRun.md)[]

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

### getRegisteredJobIds()

> __getRegisteredJobIds__(): `string`[]

Defined in: src/managers/BackgroundJobManager.ts:1576

Get all registered job IDs.

#### Returns

`string`[]

***

### getRunsReplacedAtStart()

> __getRunsReplacedAtStart__(): [`JobRunSince`](../interfaces/JobRunSince.md)[]

Defined in: src/managers/BackgroundJobManager.ts:1533

The runs the live file state held before a restore replaced it at this start (#1876).

#### Returns

[`JobRunSince`](../interfaces/JobRunSince.md)[]

***

### getStatus()

> __getStatus__(`runId`): [`JobRun`](../interfaces/JobRun.md) \| `null`

Defined in: src/managers/BackgroundJobManager.ts:1557

Get the current state of a run by runId.
Returns null if the runId is unknown.

#### Parameters

##### runId

`string`

#### Returns

[`JobRun`](../interfaces/JobRun.md) \| `null`

***

### handOff()

> __handOff__(): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:1736

Hand running work to the next process (#1717, #1611 §7). No slot starts
after this. Every running job's `ctx.signal` is aborted, and the jobs get
`ngdpbase.jobs.shutdown-grace-ms` (default 5 s) to stop. A scheduled run
that did not finish is written as `interrupted` with its last checkpoint
and its slot lock released, so the next start resumes it at once, without
counting an attempt. A job that ignores the signal is handed off anyway
when the grace ends.

Depends only on being called: the signal handlers in app.ts (SIGTERM,
SIGINT) reach it through `engine.shutdown()`, which calls it before any
other manager stops. A hard kill never gets here; its lock expires and the
resume counts as an attempt (#1716).

#### Returns

`Promise`\<`void`\>

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:378

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

### lastFinishedRun()

> __lastFinishedRun__(`jobId`): `Promise`\<[`JobLastRun`](../interfaces/JobLastRun.md) \| `null`\>

Defined in: src/managers/BackgroundJobManager.ts:775

The newest run of a job that ended, completed or failed, and who asked
for it (#2138) — what the /admin dashboard shows under Reindex and
Rebuild. Read from the history already kept: the job state, and this
process's own runs for what the state does not hold (a maintenance tick,
or no state open). Null when no job of that id is registered.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`JobLastRun`](../interfaces/JobLastRun.md) \| `null`\>

***

### listScheduledJobs()

> __listScheduledJobs__(): `Promise`\<[`ScheduledJobView`](../interfaces/ScheduledJobView.md)[]\>

Defined in: src/managers/BackgroundJobManager.ts:742

Every scheduled job, its state and its recent history.

#### Returns

`Promise`\<[`ScheduledJobView`](../interfaces/ScheduledJobView.md)[]\>

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

### registerJob()

> __registerJob__(`def`): `void`

Defined in: src/managers/BackgroundJobManager.ts:437

Register a job type. Called at startup by managers and plugins.

A job with a `schedule` is also scheduled (#1715). Its schedule, catch-up,
overlap and timeout are checked here, so a mistake is the author's error
at startup rather than a job that silently never runs.

#### Parameters

##### def

[`JobDefinition`](../interfaces/JobDefinition.md)

#### Returns

`void`

#### Throws

Error naming what is wrong with a scheduled job's declaration

***

### registerMaintenance()

> __registerMaintenance__(`spec`): `void`

Defined in: src/managers/BackgroundJobManager.ts:462

A routine maintenance tick (#1721): work whose next run does the same
job, so a missed run costs nothing — a sweep, a retention purge, a folder
rescan. One declaration for all of them, in place of a hand-rolled
`setInterval`: it runs every `everyMs` (in whole minutes, at least one),
catches nothing up, keeps nothing across a restart, never overlaps
itself, and reports only failures. It is listed on Admin → Scheduled Jobs
like any job, and can be run, paused or rescheduled from there.

`everyMs` 0 or less registers the job without a schedule: it stops
recurring, and can still be run by hand.

#### Parameters

##### spec

###### displayName

`string`

###### everyMs

`number`

###### id

`string`

###### run

(`ctx`) => `Promise`\<`string` \| `void`\>

#### Returns

`void`

***

### rerunSlot()

> __rerunSlot__(`jobId`, `slot`, `requestedBy`): `Promise`\<`string`\>

Defined in: src/managers/BackgroundJobManager.ts:855

Run one slot again, under its own key (#1611 §9): one the scheduler
skipped, or one that failed for good. As the person who asked. Success
marks that slot done; the job's next slot does not move. Returns the run id.

#### Parameters

##### jobId

`string`

##### slot

`string`

##### requestedBy

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`string`\>

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

Defined in: src/managers/BackgroundJobManager.ts:1468

Database job state comes back with the database; file job state is a declared folder BackupManager stages (#1876, #1985).

#### Returns

`boolean`

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`restoreIsStaged`](../../BaseManager/classes/default.md#restoreisstaged)

***

### retryNow()

> __retryNow__(`jobId`, `requestedBy`): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:874

Try a run that is waiting out its backoff now, rather than at its retry
time (#1611 §9). Counts as its next attempt, like any retry.

#### Parameters

##### jobId

`string`

##### requestedBy

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`void`\>

***

### runNow()

> __runNow__(`jobId`, `requestedBy`): `Promise`\<`string`\>

Defined in: src/managers/BackgroundJobManager.ts:844

Run a scheduled job now, outside its schedule (#1611 §9). As the person
who asked, with their permissions. It is no slot: it marks no slot done
and catches nothing up. Slots that come due while it runs follow the job's
overlap rule, as for any run. A restart that cuts it off restarts it, as
for any run started by hand (#1746). Returns the run id.

#### Parameters

##### jobId

`string`

##### requestedBy

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`string`\>

***

### runsSince()

> __runsSince__(`since`): `Promise`\<[`JobRunSince`](../interfaces/JobRunSince.md)[]\>

Defined in: src/managers/BackgroundJobManager.ts:1525

The runs of every registered job started after `since`, from the live state (#1876): read before a restore replaces it.

#### Parameters

##### since

`string`

#### Returns

`Promise`\<[`JobRunSince`](../interfaces/JobRunSince.md)[]\>

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

### scheduledJobNames()

> __scheduledJobNames__(): `object`[]

Defined in: src/managers/BackgroundJobManager.ts:753

Every scheduled job's id and display name, as `listScheduledJobs` names
them, without reading their state — for the admin roles page's Jobs part
(#2067).

#### Returns

`object`[]

***

### scheduledJobView()

> __scheduledJobView__(`jobId`): `Promise`\<[`ScheduledJobView`](../interfaces/ScheduledJobView.md) \| `null`\>

Defined in: src/managers/BackgroundJobManager.ts:763

One scheduled job as `listScheduledJobs` shows it, without its run
history, or null when no job of that id is scheduled. For a manager that
shows its own job's next run (BackupManager, #1563) without reading every
job's history.

#### Parameters

##### jobId

`string`

#### Returns

`Promise`\<[`ScheduledJobView`](../interfaces/ScheduledJobView.md) \| `null`\>

***

### scheduleTimeZone()

> __scheduleTimeZone__(): `string`

Defined in: src/managers/BackgroundJobManager.ts:531

The time zone the scheduler runs a schedule in when the schedule names
none (#1998): `ngdpbase.default.timezone`, UTC when it is not set. Read
each call, as the schedules are. An add-on's job passes it, with its
`ctx.slot`, to `host.zonedParts` to learn the slot's local month or day.
A schedule that names its own `tz` runs in that zone instead.

#### Returns

`string`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:1773

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

### startScheduler()

> __startScheduler__(): `void`

Defined in: src/managers/BackgroundJobManager.ts:579

Start looking for due slots (#1715). Called once the engine and its
add-ons are up, so a catch-up run never meets a manager still starting.

#### Returns

`void`

***

### tick()

> __tick__(): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:595

One look at every scheduled job: record the slots passed over, and start
the ones chosen. Public so tests can drive the clock.

#### Returns

`Promise`\<`void`\>

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

***

### whenIdle()

> __whenIdle__(): `Promise`\<`void`\>

Defined in: src/managers/BackgroundJobManager.ts:889

Resolves once every scheduled run started so far has finished.

#### Returns

`Promise`\<`void`\>
