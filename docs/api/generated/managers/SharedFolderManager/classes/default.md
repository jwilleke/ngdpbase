[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SharedFolderManager](../README.md) / default

# Class: default

Defined in: src/managers/SharedFolderManager.ts:288

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `SharedFolderManager`

Defined in: src/managers/SharedFolderManager.ts:301

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`SharedFolderManager`

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

### description

> `readonly` __description__: `"The organization's shared folders: each folder's key, the organization key and the recovery words (#1775, #2124)"` = 'The organization\\'s shared folders: each folder\\'s key, the organization key and the recovery words (#1775, #2124)'

Defined in: src/managers/SharedFolderManager.ts:289

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Overrides

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

Defined in: src/managers/SharedFolderManager.ts:354

The wrapped keys are in the backup; a backup from before #2124 has none, so it is optional.

#### Returns

[`BackupFolder`](../../BaseManager/type-aliases/BackupFolder.md)[]

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`backupFolders`](../../BaseManager/classes/default.md#backupfolders)

***

### createFolder()

> __createFolder__(`ctx`, `name`): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:701

Make shared folder `name` (#2125): its key (`createFolderKey`, which
needs the recovery words confirmed) and its place for pages, sealed with
that key. Admins only (decision 8) until the Shared folders screen
(slice 3). A new folder is opened by admins (`shared-folder-admin`) and
read by executives (`shared-folder-executive-read`), and by nobody else
until a policy names `shared/<name>`; `default` is shipped open to every
signed-in user.
Recorded as `shared-folder-create` before anything is made (on-failure
refuse). Refused when it exists.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### createFolderKey()

> __createFolderKey__(`ctx`, `folderId`): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:619

Make folder `folderId`'s own key (decision 2): a random key, wrapped
under the server key and sealed for the recovery words, so it needs the
words to exist and to be confirmed saved by the admin shown them
(`recoveryWordsConfirmed`; operator, 2026-10-29): no folder key is ever
protected only by words nobody saved. Recorded as `shared-folder-key-create` before it is
saved (on-failure refuse). The key itself is not returned; open it with
`openFolderKey`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### folderId

`string`

#### Returns

`Promise`\<`void`\>

***

### discardRecoveryWords()

> __discardRecoveryWords__(`ctx`): `void`

Defined in: src/managers/SharedFolderManager.ts:459

Forget the words shown to `ctx` and not saved: they are never shown again. A set they were to replace stays.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`void`

***

### discardUnconfirmedWords()

> __discardUnconfirmedWords__(`ctx`): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:484

Discard the saved recovery words while the admin shown them has not
confirmed saving them (operator, 2026-10-29): any holder of
`admin-system` may, so a reminder that nobody can clear (that admin's
account deleted, say) can always be cleared by making a new set and
confirming it themselves. Refused once the set is confirmed, and while
any folder key is sealed for it (`createFolderKey` needs a confirmed set,
so such a set was confirmed once). Recorded as
`shared-folder-words-discard` before the words are removed (on-failure
refuse).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`void`\>

***

### ensureShippedFolders()

> __ensureShippedFolders__(`ctx`): `Promise`\<`string`[]\>

Defined in: src/managers/SharedFolderManager.ts:740

Make the shipped folders (`SHIPPED_SHARED_FOLDERS`: `/shared/default` and
`/shared/executive`) that are not there yet, once they can be made: the
recovery words are confirmed. Finishing the words does this, and so does
every start (`ensureShippedFoldersAtBoot`), so a site that confirmed its
words before a shipped folder existed gets it on its next start.
Idempotent. Returns the folders made now.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`[]\>

***

### ensureShippedFoldersAtBoot()

> __ensureShippedFoldersAtBoot__(): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:753

At start, make the shipped folders a site with confirmed words does not
have yet (#2095), under the system context. Best-effort: a failure is
logged and never blocks start-up; nothing is tried while the keys cannot
be used.

#### Returns

`Promise`\<`void`\>

***

### folderAccess()

> __folderAccess__(`ctx`, `name`): `Promise`\<[`SharedFolderAccess`](../interfaces/SharedFolderAccess.md) & `object`\>

Defined in: src/managers/SharedFolderManager.ts:820

Who may read and who may file in folder `name`, as the Shared folders
screen set it: the roles its own policies (`shared-folder-access-<name>-read`
/ `-file`, in the site's custom configuration, in the shape the screen
writes) name, and every other policy in force that reaches the folder,
shown as it is, matched as PolicyEvaluator matches it. A policy with one of
the screen's ids that the screen did not write is shown, marked
`reserved`. `admin-system`, as the screen is. Display only: the PDP
decides every access.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### name

`string`

#### Returns

`Promise`\<[`SharedFolderAccess`](../interfaces/SharedFolderAccess.md) & `object`\>

***

### folderNames()

> __folderNames__(): `string`[]

Defined in: src/managers/SharedFolderManager.ts:686

The folders there are, by name: each has its key.

#### Returns

`string`[]

***

### foldersReadableBy()

> __foldersReadableBy__(`ctx`): `Promise`\<`string`[]\>

Defined in: src/managers/SharedFolderManager.ts:780

The folders `ctx` may open (`shared-folder-read`), by name. Asking opens
each one's key to this context (`sharedFolderKeyFor`), so the page and
file doors can read what this reader may. The session middleware asks it
on every request, so a grant removed ends access on the next request
(decision 5).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

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

### grantableRoles()

> __grantableRoles__(): `string`[]

Defined in: src/managers/SharedFolderManager.ts:847

The roles a folder's access may name: every role there is but `anonymous`, by name.

#### Returns

`string`[]

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:305

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

### mayInFolder()

> __mayInFolder__(`ctx`, `action`, `name`): `Promise`\<`boolean`\>

Defined in: src/managers/SharedFolderManager.ts:768

May `ctx` do `action` (a page or file action, or `shared-folder-read` /
`shared-folder-file`) in folder `name`? The PDP's answer
(`permitsInSharedFolder`); false for a folder that does not exist.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### action

`string`

##### name

`string`

#### Returns

`Promise`\<`boolean`\>

***

### openFolderKey()

> __openFolderKey__(`ctx`, `folderId`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/managers/SharedFolderManager.ts:666

Folder `folderId`'s key, unwrapped with the server key, for a caller the
PDP permits `shared-folder-read` on the folder (#2125). The caller holds
it for the moment it needs it and zeroes it. The page and file doors do
not call this: they reach the key through the store I/O
(`sharedFolderKeyFor`), only for a context permitted on the folder.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### folderId

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### openFolderKeyWithWords()

> __openFolderKeyWithWords__(`ctx`, `folderId`, `words`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: src/managers/SharedFolderManager.ts:974

Folder `folderId`'s key, opened with the recovery words instead of the
server key: what recovery after a lost server key will use (a later
slice: a new server key, every folder key rewrapped). Throws when the
words are wrong. Works with no server key at all.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### folderId

`string`

##### words

`string`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### pendingRecoveryWords()

> __pendingRecoveryWords__(`ctx`, `token`, `how`): `Promise`\<\{ `madeAt`: `Date`; `words`: `string`[]; `wordsId`: `string`; \}\>

Defined in: src/managers/SharedFolderManager.ts:449

The words waiting for `ctx`, to download as a file or print (#2144),
while they still wait: once saved they are gone and cannot be made again.
Recorded first as `recovery-words-export` (who, which set, how; never the
words; on-failure refuse). Refused for a token that is not the one shown
to them, or expired; the words are not discarded by a refused export.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### token

`string`

##### how

[`RecoveryWordsExport`](../../../utils/recoveryWordsFile/type-aliases/RecoveryWordsExport.md)

#### Returns

`Promise`\<\{ `madeAt`: `Date`; `words`: `string`[]; `wordsId`: `string`; \}\>

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

### prepareNewRecoveryWords()

> __prepareNewRecoveryWords__(`ctx`): `Promise`\<\{ `token`: `string`; `words`: `string`[]; \}\>

Defined in: src/managers/SharedFolderManager.ts:412

Make a new set of recovery words to replace the saved set (#2144): the
admin `ctx`, with a fresh sign-in (`admin-system` and the step-up
permission). Shown and confirmed exactly as the first set; nothing changes
until `saveRecoveryWords` with all 12 typed back, which seals every folder
key for the new words and retires the old ones. Abandoned or discarded
(`discardRecoveryWords`), the old set stays.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `token`: `string`; `words`: `string`[]; \}\>

***

### prepareRecoveryWords()

> __prepareRecoveryWords__(`ctx`): `Promise`\<\{ `token`: `string`; `words`: `string`[]; \}\>

Defined in: src/managers/SharedFolderManager.ts:397

Make the organization's 12 recovery words, to show to the admin `ctx`
once (decision 4). Nothing is saved: the words wait, in memory only, for
that admin's `saveRecoveryWords` with the returned token, for
`ngdpbase.shared-folders.words-pending-minutes`. A second call replaces
the first set unsaved. Refused while a set is saved: an unconfirmed set is
discarded first (`discardUnconfirmedWords`), and a saved set is replaced
with `prepareNewRecoveryWords`.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<\{ `token`: `string`; `words`: `string`[]; \}\>

***

### recordRead()

> __recordRead__(`ctx`, `name`, `what`): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:794

Record that `ctx` opened `what` (a page, its history, or a file) in
folder `name` (`shared-folder-read`, on by default: every read of a
shared folder is recorded, #1775). Called by what serves it, after the
door allowed it. The writes are recorded by the page and file doors.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### name

`string`

##### what

###### action?

`string`

###### attachmentId?

`string`

###### page?

`string`

#### Returns

`Promise`\<`void`\>

***

### recoveryWordsConfirmed()

> __recoveryWordsConfirmed__(): `Promise`\<`boolean`\>

Defined in: src/managers/SharedFolderManager.ts:373

Whether the admin shown the current words confirmed saving them, at the
wording's current version: their consent in `shared-folders-recovery-words`
for this set exists (ConsentManager's fact, asked each time). False with
no words, no ConsentManager, or no wording page (then nobody could have
confirmed what it says).

#### Returns

`Promise`\<`boolean`\>

***

### recoveryWordsInfo()

> __recoveryWordsInfo__(): [`SharedFoldersWordsInfo`](../interfaces/SharedFoldersWordsInfo.md) \| `null`

Defined in: src/managers/SharedFolderManager.ts:361

The organization's recovery words as made (never the words), or null: none made yet.

#### Returns

[`SharedFoldersWordsInfo`](../interfaces/SharedFoldersWordsInfo.md) \| `null`

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

### saveRecoveryWords()

> __saveRecoveryWords__(`ctx`, `token`, `typed`): `Promise`\<`string`\>

Defined in: src/managers/SharedFolderManager.ts:532

Save the recovery words shown to `ctx` (`prepareRecoveryWords` or
`prepareNewRecoveryWords`) once they proved they kept them: `typed` is
all 12 typed back (#2144). The caller asks for the tick first, and records
the confirmation with ConsentManager after (`wordsId`).

- A token that is not the one shown to them, or expired: refused, and the
  words are discarded.
- Words that do not match: `SharedFolderWordsMismatchError`; nothing is
  saved and the words still wait, to be typed again.
- The first set: recorded as `shared-folder-words-create`, then saved.
  Refused when a set was saved meanwhile.
- A new set (#2144): asks the fresh sign-in again, seals every folder key
  again for the new words from its server-key wrap, records
  `shared-folder-words-replace`, then writes the new set and the sealed
  keys as one file renamed into place: the old words stop opening the
  folders, and on any failure before that the old set stays as it was.
  Refused when the saved set changed meanwhile.

Each record is on-failure refuse, written before the save.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### token

`string`

##### typed

`string`

#### Returns

`Promise`\<`string`\>

Which set of words was saved (`recoveryWordsId`)

***

### setFolderAccess()

> __setFolderAccess__(`ctx`, `name`, `access`): `Promise`\<`boolean`\>

Defined in: src/managers/SharedFolderManager.ts:872

Set who may read and who may file in folder `name` (#2126, decision 8):
writes the site's policies `shared-folder-access-<name>-read` (granting
`shared-folder-read` on `shared/<name>`) and `-file` (`shared-folder-file`)
to the roles given, through ConfigurationManager, and removes one whose
list is empty. `admin-system`, with a fresh sign-in (the step-up
permission, as every other configuration write asks). Refused for a folder
that does not exist, a role that does not exist, `anonymous` (a folder is
never public), and a folder one of whose ids holds a policy the screen did
not write (it is never overwritten). Recorded as
`shared-folder-access-change` (who, the folder, the roles before and
after) once the write has succeeded; a failed write is recorded as a
failure, and a record that cannot be written puts the policies back
(on-failure refuse). ConfigurationManager records the configuration
change as well. Nothing is written or recorded when nothing changes.
Returns whether it changed.

Only the screen's own policies change: a shipped or add-on policy, or one
the site wrote elsewhere, still applies (`folderAccess` shows them).

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### name

`string`

##### access

[`SharedFolderAccess`](../interfaces/SharedFolderAccess.md)

#### Returns

`Promise`\<`boolean`\>

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/SharedFolderManager.ts:343

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

### unavailableReason()

> __unavailableReason__(): `string` \| `null`

Defined in: src/managers/SharedFolderManager.ts:382

Why the keys cannot be used now, or null when they can.

#### Returns

`string` \| `null`

***

### waitingWords()

> __waitingWords__(`ctx`): [`WaitingWords`](../interfaces/WaitingWords.md) \| `null`

Defined in: src/managers/SharedFolderManager.ts:437

The words waiting for `ctx` to type them back, or null: none, or they expired. Never the words.

#### Parameters

##### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`WaitingWords`](../interfaces/WaitingWords.md) \| `null`
