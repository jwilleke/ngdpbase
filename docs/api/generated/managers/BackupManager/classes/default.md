[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / default

# Class: default

Defined in: src/managers/BackupManager.ts:659

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `BackupManager`

Defined in: src/managers/BackupManager.ts:687

Creates a new BackupManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`BackupManager`

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

### applyAddonPartsAtStart()

> __applyAddonPartsAtStart__(`slug`, `folders`): [`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BackupManager.ts:1853

Put a staged restore of an add-on's folders in place before its
`register()` runs, so before any of its managers reads them (#1985).
AddonsManager calls it as it loads each add-on.

#### Parameters

##### slug

`string`

##### folders

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Returns

[`StagedRestoreAtStart`](../../BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BackupManager.ts:811

Backup BackupManager's own state (conforms to BaseManager interface)

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data for this manager

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backup`](../../BaseManager/classes/default.md#backup)

***

### backupArchive()

> __backupArchive__(`filename`): `Promise`\<\{ `name`: `string`; `stream`: `Readable`; \}\>

Defined in: src/managers/BackupManager.ts:2158

One backup as a `.tar` stream (#1723, D2): the document and every file
beside it — the databases, and the archives of attachment files, role
membership, persons, organizations, footnotes and comments (#1876) —
read from disk as the stream is consumed, never built in memory. With
the backup key set every file in it is encrypted under that key, which
is never in the archive (#1723, #1561).

#### Parameters

##### filename

`string`

#### Returns

`Promise`\<\{ `name`: `string`; `stream`: `Readable`; \}\>

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

### backupKeyInfo()

> __backupKeyInfo__(): [`BackupKeyInfo`](../interfaces/BackupKeyInfo.md)

Defined in: src/managers/BackupManager.ts:1255

The backup key as Admin → Backup shows it: set or not, its fingerprint, and whether an admin confirmed it is saved. Never the key.

#### Returns

[`BackupKeyInfo`](../interfaces/BackupKeyInfo.md)

***

### cancelStagedRestore()

> __cancelStagedRestore__(`ctx`): `Promise`\<\{ `scope`: [`RestoreScope`](../type-aliases/RestoreScope.md); `source`: `string`; \}\>

Defined in: src/managers/BackupManager.ts:2222

Throw away the restore waiting for the next start, whichever it is
(#1945): a staged site restore through `cancelStagedSiteRestore`, a
databases-only one through `DatabaseManager.cancelStagedRestore`. Each
records `backup-restore-cancel` first (refuse).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `scope`: [`RestoreScope`](../type-aliases/RestoreScope.md); `source`: `string`; \}\>

***

### cancelStagedSiteRestore()

> __cancelStagedSiteRestore__(`ctx`): `Promise`\<[`SiteRestoreManifest`](../../../utils/siteRestore/interfaces/SiteRestoreManifest.md)\>

Defined in: src/managers/BackupManager.ts:1963

Throw away a staged site restore before the restart applies it (#1876):
every staged file and the record are removed, the live data is
untouched. Recorded first (`backup-restore-cancel`, refuse).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`SiteRestoreManifest`](../../../utils/siteRestore/interfaces/SiteRestoreManifest.md)\>

***

### confirmBackupKeySaved()

> __confirmBackupKeySaved__(`ctx`, `fingerprint`, `envFingerprint?`): `Promise`\<`void`\>

Defined in: src/managers/BackupManager.ts:1339

An admin confirms the backup key with this fingerprint is saved off the
server (#1876). Recorded in the configuration (`ngdpbase.backup.key-saved-fingerprint`,
written through ConfigurationManager, which records the change), so it
survives restarts; a different key asks again. Refused when the
fingerprint is not the current key's: the page they read was stale.

With `envFingerprint` (#1976) the admin confirms the whole `.env` is
saved, the one confirmation for both reminders: the names it sets are
recorded (`ngdpbase.backup.env-keys-saved`), and so is the backup key
when the file holds it, and the shared-folders key when it holds that
(#2124, `ngdpbase.backup.shared-folders-key-saved-fingerprint`). Refused
when the names changed since the page was loaded.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### fingerprint

`string`

##### envFingerprint?

`string`

#### Returns

`Promise`\<`void`\>

***

### createBackup()

> __createBackup__(`ctx`, `options?`): `Promise`\<`string`\>

Defined in: src/managers/BackupManager.ts:852

Perform a complete backup of all managers to a file

Process:

1. Get all registered managers from engine
2. Call backup() on each manager
3. Aggregate all backup data
4. Compress to .gz file
5. Save with timestamp
6. Clean up old backups

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who asked (#1179): the request's subject, or the schedule's JobContext. First and mandatory — a full copy of the instance is made on someone's behalf.

##### options?

[`BackupOptions`](../interfaces/BackupOptions.md) = `{}`

Backup options

#### Returns

`Promise`\<`string`\>

Path to created backup file

***

### envKeysInfo()

> __envKeysInfo__(): [`EnvKeysInfo`](../interfaces/EnvKeysInfo.md) \| `null`

Defined in: src/managers/BackupManager.ts:1217

The instance `.env` key set as Admin → Backup shows it (#1976), or null when the site has no instance data folder or the file can't be read. Never a value.

#### Returns

[`EnvKeysInfo`](../interfaces/EnvKeysInfo.md) \| `null`

***

### findStoredBackup()

> __findStoredBackup__(`filename`): `Promise`\<[`StoredBackup`](../interfaces/StoredBackup.md) \| `null`\>

Defined in: src/managers/BackupManager.ts:2146

A backup in the backup directory by its bare filename, or null: never a path the caller made up.

#### Parameters

##### filename

`string`

#### Returns

`Promise`\<[`StoredBackup`](../interfaces/StoredBackup.md) \| `null`\>

***

### getAutoBackupStatus()

> __getAutoBackupStatus__(): `Promise`\<\{ `config`: [`AutoBackupConfig`](../interfaces/AutoBackupConfig.md); `lastBackup`: `Date` \| `null`; \}\>

Defined in: src/managers/BackupManager.ts:2381

Return current auto-backup configuration and last backup info for the admin UI.

#### Returns

`Promise`\<\{ `config`: [`AutoBackupConfig`](../interfaces/AutoBackupConfig.md); `lastBackup`: `Date` \| `null`; \}\>

***

### getBackupHealth()

> __getBackupHealth__(): `Promise`\<[`BackupHealth`](../interfaces/BackupHealth.md)\>

Defined in: src/managers/BackupManager.ts:1459

Whether backups are working (#1563), from what is on disk: the newest
good backup in the backup directory, the failure kept in the health
record, the automatic-backup schedule, and free space at the destination.

No good backup within the window is an outage. The window is
`ngdpbase.backup.stale-interval-multiplier` (default 2) times the longest
gap between automatic backups when they are on, and
`ngdpbase.backup.stale-fallback-days` (default 7) when they are off.

#### Returns

`Promise`\<[`BackupHealth`](../interfaces/BackupHealth.md)\>

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

### getLatestBackup()

> __getLatestBackup__(): `Promise`\<`string` \| `null`\>

Defined in: src/managers/BackupManager.ts:2373

Get the most recent backup file path

#### Returns

`Promise`\<`string` \| `null`\>

Path to most recent backup, or null if none exist

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

### getStagedRestore()

> __getStagedRestore__(): \{ `scope`: [`RestoreScope`](../type-aliases/RestoreScope.md); `source`: `string`; `stagedBy`: `string`; \} \| `null`

Defined in: src/managers/BackupManager.ts:2204

The restore waiting for the next start, whichever it is (#1945): a site
restore, or a databases-only one. A site restore stages the databases
too, so it is the one named while both records are there.

#### Returns

\{ `scope`: [`RestoreScope`](../type-aliases/RestoreScope.md); `source`: `string`; `stagedBy`: `string`; \} \| `null`

***

### getStagedSiteRestore()

> __getStagedSiteRestore__(): [`SiteRestoreManifest`](../../../utils/siteRestore/interfaces/SiteRestoreManifest.md) \| `null`

Defined in: src/managers/BackupManager.ts:1863

The site restore staged and waiting for the next start, or null (#1876). Throws for a record that can't be read.

#### Returns

[`SiteRestoreManifest`](../../../utils/siteRestore/interfaces/SiteRestoreManifest.md) \| `null`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/BackupManager.ts:744

Initialize BackupManager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available

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

### isRestoreRunning()

> __isRestoreRunning__(): `boolean`

Defined in: src/managers/BackupManager.ts:2168

Whether a restore started from Admin → Backup is still taking its fresh backup or staging.

#### Returns

`boolean`

***

### listBackups()

> __listBackups__(): `Promise`\<[`BackupFileInfo`](../interfaces/BackupFileInfo.md)[]\>

Defined in: src/managers/BackupManager.ts:2308

List all available backups

#### Returns

`Promise`\<[`BackupFileInfo`](../interfaces/BackupFileInfo.md)[]\>

List of backup files with metadata

***

### listStoredBackups()

> __listStoredBackups__(): `Promise`\<[`StoredBackup`](../interfaces/StoredBackup.md)[]\>

Defined in: src/managers/BackupManager.ts:2125

The backups in the backup directory with the database files beside each
(#1723): what Admin → Backup offers to download and restore. Read from
the file names, so no document is opened to list them.

#### Returns

`Promise`\<[`StoredBackup`](../interfaces/StoredBackup.md)[]\>

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

### refreshBackupHealth()

> __refreshBackupHealth__(): `Promise`\<[`BackupHealth`](../interfaces/BackupHealth.md) \| `null`\>

Defined in: src/managers/BackupManager.ts:1494

Bring the dashboard in line with whether backups work (#1563): an outage
(`markDegraded`) while a backup has failed or none is recent enough,
cleared — only that one — once they work, then the backup key's reminder
(`checkBackupKey`), which never hides an outage. A stretch with no recent
backup notifies admins once, kept across restarts. Run at start, on the
`backup.health` timer, and after every backup.

#### Returns

`Promise`\<[`BackupHealth`](../interfaces/BackupHealth.md) \| `null`\>

***

### reportRestoreAtBoot()

> __reportRestoreAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/BackupManager.ts:2017

Tell admins what this start did with a staged restore (#1876). Called
once every manager and add-on has started (`WikiEngine.initializeAddons`):
each owner applied (or set aside) its part as it started, add-ons last.
After any restore that was applied, a critical notification lists what it
did not bring back, and the job runs between the backup and the restore.

#### Returns

`Promise`\<`void`\>

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

### restoreFromFile()

> __restoreFromFile__(`ctx`, `backupPath`, `options?`): `Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md)\>

Defined in: src/managers/BackupManager.ts:1627

Restore all managers from a backup file

Process:

1. Read and decompress backup file
2. Parse JSON data
3. Validate backup structure
4. Call restore() on each manager with its data

The databases (#1723) go first, and are staged for the next start rather
than restored in place: a fresh backup of the live data is taken, then
DatabaseManager stages every database in the backup. If either fails,
nothing at all is restored.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Who asked (#1179): a restore takes a backup and replaces the instance's data on someone's behalf.

##### backupPath

`string`

Path to backup file

##### options?

[`RestoreOptions`](../interfaces/RestoreOptions.md) = `{}`

Restore options

#### Returns

`Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md)\>

Restore results

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

### restoreState()

> __restoreState__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/BackupManager.ts:828

Restore BackupManager's own state (conforms to BaseManager interface)

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data from backup()

#### Returns

`Promise`\<`void`\>

***

### revealBackupKey()

> __revealBackupKey__(): `string` \| `null`

Defined in: src/managers/BackupManager.ts:1268

The backup key itself, for the one page that asks an admin to copy it
off the server (#1876). The route asks `config-manage`, with its fresh
sign-in; nothing else shows, logs or returns it.

#### Returns

`string` \| `null`

***

### revealBackupKeyFile()

> __revealBackupKeyFile__(`ctx`): `Promise`\<\{ `fingerprint`: `string`; `text`: `string`; \} \| `null`\>

Defined in: src/managers/BackupManager.ts:1280

The backup key as a small text file, for an admin to keep off the server
without the rest of `.env` (#2134). The route asks `config-manage`, with
its fresh sign-in. Recorded as `backup-key-download` (who and the
fingerprint, never the key) before the file is made: on-failure refuse,
so a record that cannot be written throws and nothing is sent. Null when
the site has no backup key. Nothing is kept on the server.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `fingerprint`: `string`; `text`: `string`; \} \| `null`\>

***

### revealInstanceEnv()

> __revealInstanceEnv__(`ctx`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/managers/BackupManager.ts:1307

The instance `.env` exactly as it is on disk, backup key line included,
for an admin to keep a copy off the server (#1938). The route asks
`config-manage`, with its fresh sign-in. Recorded as `secret-reveal`:
the file, never its contents. Null when the site has no instance `.env`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

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

### sharedFoldersKeyInfo()

> __sharedFoldersKeyInfo__(): [`BackupKeyInfo`](../interfaces/BackupKeyInfo.md)

Defined in: src/managers/BackupManager.ts:1247

The shared-folders key as Admin → Backup shows it (#2124): set or not,
its fingerprint, and whether an admin confirmed a saved `.env` holding
it. Never the key. Read at use, like the backup key.

#### Returns

[`BackupKeyInfo`](../interfaces/BackupKeyInfo.md)

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

### siteRestoreScope()

> __siteRestoreScope__(): `object`

Defined in: src/managers/BackupManager.ts:2188

What a whole-site restore on this site puts back and what it does not
(#1945), in the words admins read: the labels of the "not restored"
notification (`restoreLabel`, `NEVER_IN_A_BACKUP`), so the restore card
and the notification after the restart say the same. Read from the
managers on this site, not from any backup: a backup can hold less (the
credentials store of one taken without the backup key), never more.

#### Returns

`object`

##### notRestored

> __notRestored__: `string`[]

##### restored

> __restored__: `string`[]

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

### startRestore()

> __startRestore__(`ctx`, `filename`, `options?`): `Promise`\<\{ `done`: `Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md) \| `null`\>; \}\>

Defined in: src/managers/BackupManager.ts:2252

Start a restore of a stored backup from Admin → Backup: recorded, then a
fresh backup of the live data and the staging run in the background, and
admins are told when it is staged or why it was not. Nothing changes
until the next restart, which the site never does by itself. Refused
while another is being prepared, and when a restore is already staged
unless `replace` says to replace it.

- `scope: 'databases'` (the default; #1723, D1): the databases only.
  Refused while a site restore is staged, since that includes them.
- `scope: 'site'` (#1945): a whole-site restore, every manager whose
  restore is staged and the instance .env, all or nothing
  (`stageSiteRestore`), from any stored backup. It replaces a staged
  restore of either kind only with `replace`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### filename

`string`

##### options?

###### replace?

`boolean`

###### scope?

[`RestoreScope`](../type-aliases/RestoreScope.md)

#### Returns

`Promise`\<\{ `done`: `Promise`\<[`RestoreResults`](../interfaces/RestoreResults.md) \| `null`\>; \}\>

the running restore, for a caller (a test) that waits on it.

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

### updateAutoBackupConfig()

> __updateAutoBackupConfig__(`config`, `ctx`): `Promise`\<`void`\>

Defined in: src/managers/BackupManager.ts:2399

Update auto-backup configuration and persist to config store.
Restarts the scheduler with the new settings.

#### Parameters

##### config

`Partial`\<[`AutoBackupConfig`](../interfaces/AutoBackupConfig.md)\>

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`void`\>
