[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [ImportManager](../README.md) / default

# Class: default

Defined in: src/managers/ImportManager.ts:479

## Extends

- [`default`](../../managers/BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `ImportManager`

Defined in: src/managers/ImportManager.ts:507

#### Parameters

##### engine

[`WikiEngine`](../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`ImportManager`

#### Overrides

[`default`](../../managers/BaseManager/classes/default.md).[`constructor`](../../managers/BaseManager/classes/default.md#constructor)

## Properties

### config?

> `protected` `optional` __config?__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/BaseManager.ts:325

Configuration passed during initialization

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`config`](../../managers/BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`description`](../../managers/BaseManager/classes/default.md#description)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`engine`](../../managers/BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`initialized`](../../managers/BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../managers/BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/ImportManager.ts:3574

Backup manager data (no persistent data to backup)

#### Returns

`Promise`\<[`BackupData`](../../managers/BaseManager/interfaces/BackupData.md)\>

#### Overrides

[`default`](../../managers/BaseManager/classes/default.md).[`backup`](../../managers/BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../managers/BaseManager/type-aliases/BackupFolder.md)[]

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

[`BackupFolder`](../../managers/BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`backupFolders`](../../managers/BaseManager/classes/default.md#backupfolders)

***

### detectFormat()

> __detectFormat__(`content`, `filename`): `string` \| `null`

Defined in: src/managers/ImportManager.ts:2020

Auto-detect format from file content

#### Parameters

##### content

`string`

File content

##### filename

`string`

Filename (for extension matching)

#### Returns

`string` \| `null`

Format ID or null if no match

***

### enqueueImport()

> __enqueueImport__(`request`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/ImportManager.ts:795

Queue an import as background work and return its run id at once. The
run carries `ctx` — the user who asked (`jobContextFromRequest`), or a
job's context with its reason — and each receiver checks its own
permission with it when the run reaches it (D5). A user's upload, from
a request, goes through [enqueueUpload](#enqueueupload) instead.

#### Parameters

##### request

[`IceRunRequest`](../../ice/types/interfaces/IceRunRequest.md)

##### ctx

[`JobContext`](../../context/JobContext/interfaces/JobContext.md)

#### Returns

`Promise`\<`string`\>

***

### enqueueUpload()

> __enqueueUpload__(`request`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/ImportManager.ts:820

Queue a user's upload, from the request it arrived in (#2034). `ctx` is
the REQUEST's context; the run carries the job context derived from it
(`jobContextFromRequest`), as [enqueueImport](#enqueueimport) does.

When the run keeps originals through a receiver that keeps into an
encrypted store (`keepsEncrypted`), they are kept first, here, with
`ctx`, while the user's key is in the request: the bytes are sealed and
the store's sealed index entry written. Each is recorded in the ledger
as the keep-once record (#2011), so the run reuses it and needs no key.

A receiver whose `receive` itself may write into an encrypted store
(`writesEncrypted`, #2118) has the whole run now, in this request, with
`ctx` and its key, and the run's id is returned when it has ended: no
key is ever carried into a job (#2034).

#### Parameters

##### request

[`IceRunRequest`](../../ice/types/interfaces/IceRunRequest.md)

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

#### Throws

ImportUploadRefused when an original could not be kept; nothing is queued

***

### exportFile()

> __exportFile__(`runId`, `ctx`): \{ `bytes`: `Buffer`; `mediaType`: `string`; `name`: `string`; \} \| `null`

Defined in: src/managers/ImportManager.ts:1018

An export's file, to the user it runs as, while it is kept; null otherwise.

#### Parameters

##### runId

`string`

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

\{ `bytes`: `Buffer`; `mediaType`: `string`; `name`: `string`; \} \| `null`

***

### exportFormatsFor()

> __exportFormatsFor__(`sourceId`, `ref`, `ctx`): `Promise`\<[`IceExportFormat`](../../ice/types/interfaces/IceExportFormat.md)[]\>

Defined in: src/managers/ImportManager.ts:952

The formats the Export action offers this context for one thing (#2120):
none when the source's owner would not let it export the thing (asked
as an affordance, recording nothing), else each `out` shim, switched on,
that can make a file from what the source yields.

#### Parameters

##### sourceId

`string`

##### ref

`string`

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`IceExportFormat`](../../ice/types/interfaces/IceExportFormat.md)[]\>

***

### getAvailableFormats()

> __getAvailableFormats__(): `string`[]

Defined in: src/managers/ImportManager.ts:1986

Get available format IDs

#### Returns

`string`[]

Array of registered format identifiers

***

### getConverter()

> __getConverter__(`formatId`): [`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md) \| `undefined`

Defined in: src/managers/ImportManager.ts:1996

Get converter by format ID

#### Parameters

##### formatId

`string`

Format identifier

#### Returns

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md) \| `undefined`

Converter instance or undefined

***

### getConverterInfo()

> __getConverterInfo__(): `object`[]

Defined in: src/managers/ImportManager.ts:2005

Get all registered converters with their metadata

#### Returns

`object`[]

Array of converter info objects

***

### getEngine()

> __getEngine__(): [`WikiEngine`](../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:458

Get the wiki engine instance

#### Returns

[`WikiEngine`](../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Example

```ts
const config = this.getEngine().getConfig();
```

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`getEngine`](../../managers/BaseManager/classes/default.md#getengine)

***

### getExportRun()

> __getExportRun__(`runId`, `ctx`): [`IceExportReport`](../../ice/types/interfaces/IceExportReport.md) \| `null`

Defined in: src/managers/ImportManager.ts:1012

An export's status, to the user it runs as; null to anyone else, and once it is let go.

#### Parameters

##### runId

`string`

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`IceExportReport`](../../ice/types/interfaces/IceExportReport.md) \| `null`

***

### getImportRun()

> __getImportRun__(`runId`, `ctx`): [`IceRunReport`](../../ice/types/interfaces/IceRunReport.md) \| `null`

Defined in: src/managers/ImportManager.ts:848

A run's report, to the person it runs as; null to anyone else.

#### Parameters

##### runId

`string`

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`IceRunReport`](../../ice/types/interfaces/IceRunReport.md) \| `null`

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../managers/BaseManager/interfaces/ManagerStats.md)\>

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

`Promise`\<[`ManagerStats`](../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`getManagerStats`](../../managers/BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../managers/BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../managers/BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`getManagerStatus`](../../managers/BaseManager/classes/default.md#getmanagerstatus)

***

### givenNameProblem()

> __givenNameProblem__(`receiverId`, `given`, `original`): `string` \| `null`

Defined in: src/managers/ImportManager.ts:690

Why a name the user gave cannot be used for this receiver (#2130), or
null when it can: the engine's one rule (`givenNameProblem`), with the
site's `ngdpbase.import.engine.name-max-length`. A receiver that names
what it creates itself (no `names`) takes no name at all. For the import
screen, to answer at once; the engine checks again in the run.

#### Parameters

##### receiverId

`string`

##### given

`string`

##### original

`string`

#### Returns

`string` \| `null`

***

### importFromUrl()

> __importFromUrl__(`url`, `options`): `Promise`\<[`ImportedFile`](../interfaces/ImportedFile.md)\>

Defined in: src/managers/ImportManager.ts:2672

Import a page from a URL

Fetches the URL and imports it like a file import of the same HTML
(#1337): the NCM normalizer (links, tables, `ncmVersion`), the #1332 fix
steps, then a save through PageManager — validated, audited as the
importer, versioned and indexed. The fetched page's schema.org metadata
and the source URL are kept in frontmatter.

#### Parameters

##### url

`string`

URL to fetch and import

##### options

The importer's context, and optional title and dryRun

###### actorContext

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

###### dryRun?

`boolean`

###### title?

`string`

#### Returns

`Promise`\<[`ImportedFile`](../interfaces/ImportedFile.md)\>

Imported file info

***

### importOwnStoreTakeout()

> __importOwnStoreTakeout__(`ctx`, `options`): `Promise`\<[`TakeoutImportReport`](../type-aliases/TakeoutImportReport.md)\>

Defined in: src/managers/ImportManager.ts:3255

Import a takeout into one of the requester's OWN private stores (#1472).

The mirror of `PageManager.buildOwnStoreTakeout`, and not `importPages`:
that reads a directory on the server, so a decrypted takeout would have to
be staged on disk, and it converts every page, which would rewrite bodies
that are already this system's own markdown. Here the archive is read in
memory and each page and file goes through the same doors an edit and an
upload use, so a sealed store encrypts on write with no new crypto.

Refused before anything is written — never a partial import — when the
requester is not the owner, the store is not theirs, or it is encrypted
and locked in this session.

Idempotent (operator, 2026-09-25): importing the same takeout twice leaves
the store as the first import did.

- Files first, so page links can be pointed at them. The store's upload
    finds a file whose bytes it already holds and returns that one, so a
    second import stores nothing new.
- A page whose uuid the target store already holds is skipped:
    `unchanged` when its body matches, `changed-since-takeout` when not —
    the live page wins.
- A page whose uuid is used elsewhere on the site is skipped as
    `uuid-elsewhere`, naming the page only when the requester may view it.
- A title held by a DIFFERENT page lands beside it as `Title (imported)`.

This is not a restore: a takeout carries no history and no trash.

#### Parameters

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

Who is importing; only into their own container

##### options

###### archive

`Buffer`

###### limits

[`ZipReadLimits`](../../utils/zipArchive/type-aliases/ZipReadLimits.md)

###### sourceName?

`string`

The uploaded file's name, for the report page.

###### store

`string`

#### Returns

`Promise`\<[`TakeoutImportReport`](../type-aliases/TakeoutImportReport.md)\>

***

### importPages()

> __importPages__(`options`): `Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Defined in: src/managers/ImportManager.ts:2067

Import pages from source directory

#### Parameters

##### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options

#### Returns

`Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Import result with statistics and file details

***

### importPagesWithProgress()

> __importPagesWithProgress__(`options`): `Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Defined in: src/managers/ImportManager.ts:2057

Import pages with streaming progress updates
Alias for importPages that makes the progress callback more explicit

#### Parameters

##### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options with onProgress callback

#### Returns

`Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Import result with statistics and file details

***

### importRunsFor()

> __importRunsFor__(`ctx`): [`IceRunReport`](../../ice/types/interfaces/IceRunReport.md)[]

Defined in: src/managers/ImportManager.ts:854

The runs this process holds for the user `ctx` names, newest first (#2021): their own, never anyone else's.

#### Parameters

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

[`IceRunReport`](../../ice/types/interfaces/IceRunReport.md)[]

***

### importSinglePage()

> __importSinglePage__(`filePath`, `options`): `Promise`\<[`ImportedFile`](../interfaces/ImportedFile.md) \| `null`\>

Defined in: src/managers/ImportManager.ts:2302

Import a single page

#### Parameters

##### filePath

`string`

Source file path

##### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options

#### Returns

`Promise`\<[`ImportedFile`](../interfaces/ImportedFile.md) \| `null`\>

Imported file info or null if skipped

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/ImportManager.ts:515

Initialize the manager

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../managers/BaseManager/classes/default.md).[`initialize`](../../managers/BaseManager/classes/default.md#initialize)

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

[`default`](../../managers/BaseManager/classes/default.md).[`invalidateHandlerCache`](../../managers/BaseManager/classes/default.md#invalidatehandlercache)

***

### isConfidential()

> __isConfidential__(`receiverId`): `boolean`

Defined in: src/managers/ImportManager.ts:916

Is an import into this receiver confidential (#2110)? Only when its
destination is encrypted: a receiver that keeps into a sealed store
(`keepsEncrypted`), or whose own door writes into one
(`writesEncrypted`, #2118). No receiver can declare itself so otherwise. A
confidential import's file names are shown to the uploader and kept in
the audit log, and never written to application logs, notices, admin
screens or the import ledger (#2161); every other import logs them as before.

#### Parameters

##### receiverId

`string`

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

[`default`](../../managers/BaseManager/classes/default.md).[`isInitialized`](../../managers/BaseManager/classes/default.md#isinitialized)

***

### isShimEnabled()

> __isShimEnabled__(`id`): `boolean`

Defined in: src/managers/ImportManager.ts:649

Is this shim switched on (D6)? `ngdpbase.import.shims.<id>.enabled`, default on.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### listShims()

> __listShims__(): (`Pick`\<[`RegisteredShim`](../../ice/types/interfaces/RegisteredShim.md), `"id"` \| `"label"` \| `"owner"` \| `"receivers"` \| `"direction"` \| `"produces"`\> & `object`)[]

Defined in: src/managers/ImportManager.ts:654

Every registered shim, and whether it is on.

#### Returns

(`Pick`\<[`RegisteredShim`](../../ice/types/interfaces/RegisteredShim.md), `"id"` \| `"label"` \| `"owner"` \| `"receivers"` \| `"direction"` \| `"produces"`\> & `object`)[]

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

[`AttentionOptions`](../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`markDegraded`](../../managers/BaseManager/classes/default.md#markdegraded)

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

[`default`](../../managers/BaseManager/classes/default.md).[`markDisabled`](../../managers/BaseManager/classes/default.md#markdisabled)

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

[`AttentionOptions`](../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`markFailed`](../../managers/BaseManager/classes/default.md#markfailed)

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

[`AttentionOptions`](../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`markNeedsAttention`](../../managers/BaseManager/classes/default.md#markneedsattention)

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

[`default`](../../managers/BaseManager/classes/default.md).[`markReady`](../../managers/BaseManager/classes/default.md#markready)

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

[`default`](../../managers/BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../managers/BaseManager/classes/default.md#markreadyifdegradedby)

***

### preflightConfiguredPath()

> `protected` __preflightConfiguredPath__(`configKey`, `path`, `options?`): [`PathPreflightResult`](../../utils/PathPreflight/interfaces/PathPreflightResult.md)

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

[`PathPreflightOptions`](../../utils/PathPreflight/interfaces/PathPreflightOptions.md) = `{}`

#### Returns

[`PathPreflightResult`](../../utils/PathPreflight/interfaces/PathPreflightResult.md)

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

[`default`](../../managers/BaseManager/classes/default.md).[`preflightConfiguredPath`](../../managers/BaseManager/classes/default.md#preflightconfiguredpath)

***

### previewImport()

> __previewImport__(`options`): `Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Defined in: src/managers/ImportManager.ts:2046

Preview import without writing files

#### Parameters

##### options

[`ImportOptions`](../interfaces/ImportOptions.md)

Import options (dryRun is forced to true)

#### Returns

`Promise`\<[`ImportResult`](../interfaces/ImportResult.md)\>

Import result with preview data

***

### receiversFor()

> __receiversFor__(`ctx`): `Promise`\<[`UsableReceiver`](../interfaces/UsableReceiver.md)[]\>

Defined in: src/managers/ImportManager.ts:666

The receivers this context may use (D5): each answers with its own
existing permission. Each comes with the original-file choices it offers
(D11), for the import screen (#2021).

#### Parameters

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`UsableReceiver`](../interfaces/UsableReceiver.md)[]\>

***

### recentImportsFor()

> __recentImportsFor__(`ctx`): `Promise`\<[`RecentImport`](../../ice/types/interfaces/RecentImport.md)[]\>

Defined in: src/managers/ImportManager.ts:871

The user's own recent imports, file by file, read from the ledger
(#2110), so the list survives a restart: newest first, across the
receivers `ctx` may use, at most `ngdpbase.import.engine.recent-imports`.
Only the scopes bound to this user's identity (#2013), never anyone
else's; a caller's narrower scope (phr's source id) is not read. Each
entry links to what it created when the receiver says this user may
open it (`linkFor`). Nothing is stored for this.

#### Parameters

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<[`RecentImport`](../../ice/types/interfaces/RecentImport.md)[]\>

#### Throws

IdentityStoreUnavailableError when the identity store cannot
  answer: whose entries they are cannot be told, so none is shown

***

### registerConverter()

> __registerConverter__(`converter`): `void`

Defined in: src/managers/ImportManager.ts:564

Register a content converter. Since #1979 (D8) it is also the ICE shim
`core.<formatId>`, producing NCM for the pages receiver, so the folder
import and the engine run the same conversion.

#### Parameters

##### converter

[`IContentConverter`](../../IContentConverter/interfaces/IContentConverter.md)

Converter instance implementing IContentConverter

#### Returns

`void`

***

### registerExportSource()

> __registerExportSource__(`owner`, `source`): `string`

Defined in: src/managers/ImportManager.ts:935

Register an export source (#2120): the owner's door for reading what is
exported, checking its existing read permission (D5). Core's is
`core.pages`.

#### Parameters

##### owner

`string`

##### source

[`IceExportSource`](../../ice/types/interfaces/IceExportSource.md)

#### Returns

`string`

The source's id, `<owner>.<name>`

#### Throws

Error when the source is malformed or its id is taken

***

### registerReceiver()

> __registerReceiver__(`owner`, `receiver`): `string`

Defined in: src/managers/ImportManager.ts:608

Register a receiver (D4): a door that already exists. Core's are
`core.pages` and `core.files`; an add-on registers its own manager's door
through `host.registerReceiver`. Refuses `writesEncrypted` from every
caller, whatever owner it names: core registers its own receivers
through the private `#registerReceiver` (#2179).

#### Parameters

##### owner

`string`

##### receiver

[`IceReceiver`](../../ice/types/interfaces/IceReceiver.md)

#### Returns

`string`

The receiver's id, `<owner>.<name>`

***

### registerShim()

> __registerShim__(`owner`, `shim`): `string`

Defined in: src/managers/ImportManager.ts:583

Register a shim (D6, D7). Core registers its own as owner `core`; an
add-on registers through `host.registerShim`, which names the add-on as
the owner and refuses a shim its manifest does not declare.

#### Parameters

##### owner

`string`

##### shim

[`IceShim`](../../ice/types/interfaces/IceShim.md)

#### Returns

`string`

The shim's id, `<owner>.<name>`

#### Throws

Error when the shim is malformed or its id is taken

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/ImportManager.ts:3587

Restore manager data (no persistent data to restore)

#### Parameters

##### backupData

[`BackupData`](../../managers/BaseManager/interfaces/BackupData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../managers/BaseManager/classes/default.md).[`restore`](../../managers/BaseManager/classes/default.md#restore)

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

[`default`](../../managers/BaseManager/classes/default.md).[`restoreIsStaged`](../../managers/BaseManager/classes/default.md#restoreisstaged)

***

### runImport()

> __runImport__(`request`, `ctx`): `Promise`\<[`IceRunReport`](../../ice/types/interfaces/IceRunReport.md)\>

Defined in: src/managers/ImportManager.ts:780

Run one import now and wait for it. For code already off the request
path: an add-on's own background job, a test. A route uses
[enqueueImport](#enqueueimport), so the work runs off the request path.

#### Parameters

##### request

[`IceRunRequest`](../../ice/types/interfaces/IceRunRequest.md)

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

Who it runs as: the person's context, or a job's (P1)

#### Returns

`Promise`\<[`IceRunReport`](../../ice/types/interfaces/IceRunReport.md)\>

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../managers/BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`safeGetManagerStats`](../../managers/BaseManager/classes/default.md#safegetmanagerstats)

***

### setImportLedger()

> __setImportLedger__(`ledger`): `void`

Defined in: src/managers/ImportManager.ts:921

Use this ledger instead of the file one: a test's, or a database table's.

#### Parameters

##### ledger

[`IceLedger`](../../ice/types/interfaces/IceLedger.md)

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/ImportManager.ts:3595

Shutdown the manager

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../managers/BaseManager/classes/default.md).[`shutdown`](../../managers/BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../managers/BaseManager/classes/default.md#stagedrestoreatstart)

***

### startExport()

> __startExport__(`request`, `ctx`): `Promise`\<`string`\>

Defined in: src/managers/ImportManager.ts:981

Start an export (#2120), from the request that asked: the source reads
the thing now, with the request's own context, so its owner's door
decides with everything the request carries (step-up, a vault's key)
and records the export. The shims run off the request path, in the ICE
background job, as the user's own job context. Returns the run id at once.

Before anything is read, the user may have at most
`max-queued-per-user` exports queued or running, and a held run must be
free to make room under `max-kept-runs`. Once read, the items count
toward `max-held-bytes` until their file is made.

#### Parameters

##### request

[`IceExportRequest`](../../ice/types/interfaces/IceExportRequest.md)

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

#### Returns

`Promise`\<`string`\>

#### Throws

IceExportRefused when the thing is not there, the user may not
  export it, or the format is not one offered for it

#### Throws

IceExportNeedsFreshSignIn when the user holds the permission but
  step-up asks for a fresh sign-in

#### Throws

IceExportBusy when the user, or the site, is making as many
  exports as it may

#### Throws

IceExportFailed when the thing is larger than this site exports

***

### toFormOptions()

> __toFormOptions__(`_options?`, `_viewer?`): `Promise`\<[`FormOption`](../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

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

`Promise`\<[`FormOption`](../../utils/pluginFormatters/interfaces/FormOption.md)[]\>

`{ value, label }` choices (plain strings are accepted too), or `[]`.

#### Inherited from

[`default`](../../managers/BaseManager/classes/default.md).[`toFormOptions`](../../managers/BaseManager/classes/default.md#toformoptions)

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

[`ManagerFetchOptions`](../../utils/managerUtils/interfaces/ManagerFetchOptions.md) = `{}`

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

[`default`](../../managers/BaseManager/classes/default.md).[`toMarqueeText`](../../managers/BaseManager/classes/default.md#tomarqueetext)

***

### vetFile()

> __vetFile__(`upload`, `ctx`): `Promise`\<[`IceVetResult`](../../ice/types/interfaces/IceVetResult.md)\>

Defined in: src/managers/ImportManager.ts:760

Vet one file before it is kept as a file (#2149): its type from its
bytes (#1624), then its format's shim, when that shim is switched on,
cleans it. FileManager asks this for every file it stores, and keeps the
bytes returned, never the ones it sent; `removed` says what was taken
out, for the uploader and the upload's record.

Runs in the caller's request: cleaning is one linear pass over a file no
larger than the site's upload limit. It decides nothing about permission:
the caller has asked that first.

#### Parameters

##### upload

[`IceUpload`](../../ice/types/interfaces/IceUpload.md)

##### ctx

[`ActorContext`](../../context/ActorContext/type-aliases/ActorContext.md)

Who is keeping the file (P1); only named in the log line when something was cleaned

#### Returns

`Promise`\<[`IceVetResult`](../../ice/types/interfaces/IceVetResult.md)\>

#### Throws

IceVetRefused when the cleaning shim fails: the file could not be checked, so it is not kept
