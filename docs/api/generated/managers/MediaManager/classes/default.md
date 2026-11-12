[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/MediaManager](../README.md) / default

# Class: default

Defined in: src/managers/MediaManager.ts:48

The Manager-layer contract for asset sources (Decision 7).

PageManager / MediaManager / AttachmentManager each implement this
during their `initialize()`, registering themselves with
CatalogManager via `registerSource()`. Storage providers underneath
stay diverse and pluggable per-deployment.

ACL filtering happens here (each source knows its permission model).
`get()` returns `null` for both not-found and ACL-filtered; only throw
on actual errors.

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Implements

- [`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md)

## Constructors

### Constructor

> __new default__(`engine`): `MediaManager`

Defined in: src/managers/MediaManager.ts:79

Handle for the periodic rescan interval timer

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`MediaManager`

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

### CURRENT\_SCHEMA\_VERSION

> `readonly` `static` __CURRENT\_SCHEMA\_VERSION__: `1` = `1`

Defined in: src/managers/MediaManager.ts:60

On-disk schema version for media-index.json (Decision 6).
Bump when the persisted MediaIndexEntry shape changes; current v1 is
the post-Slice-3 (#758) shape including duration/bitrate/codecs.

***

### currentSchemaVersion

> `readonly` __currentSchemaVersion__: `1` = `MediaManager.CURRENT_SCHEMA_VERSION`

Defined in: src/managers/MediaManager.ts:61

Schema version of the on-disk records this source writes/reads.
Compared against the manager's CURRENT_SCHEMA_VERSION constant on
startup (Decision 6).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`currentSchemaVersion`](../../../types/Schema/interfaces/CatalogSource.md#currentschemaversion)

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

***

### sourceId

> `readonly` __sourceId__: `"media"` = `'media'`

Defined in: src/managers/MediaManager.ts:50

CatalogSource identifier (Slice 3 of #755 / #758).

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`sourceId`](../../../types/Schema/interfaces/CatalogSource.md#sourceid)

***

### types

> `readonly` __types__: readonly [`SchemaType`](../../../types/Schema/type-aliases/SchemaType.md)[]

Defined in: src/managers/MediaManager.ts:53

Subtypes this source produces — MIME-discriminated at item level.

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`types`](../../../types/Schema/interfaces/CatalogSource.md#types)

## Accessors

### provider

#### Get Signature

> __get__ __provider__(): [`default`](../../../BaseMediaProvider/classes/default.md) \| `null`

Defined in: src/managers/MediaManager.ts:70

Return the active media provider for use by AssetManager.

##### Returns

[`default`](../../../BaseMediaProvider/classes/default.md) \| `null`

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

### checkFolders()

> __checkFolders__(`folders`): `string`[]

Defined in: src/managers/MediaManager.ts:339

Why each of `folders` may not be a media folder, empty when all may (#2195).
The configuration screen asks before saving `ngdpbase.media.folders`.

#### Parameters

##### folders

`string`[]

#### Returns

`string`[]

***

### count()

> __count__(): `Promise`\<`number`\>

Defined in: src/managers/MediaManager.ts:554

How many items the year listing covers (#1741) — the number
`getYears()` + `listByYear()` add up to, without listing them.

#### Returns

`Promise`\<`number`\>

***

### explainPath()

> __explainPath__(`target`): `Promise`\<[`MediaPathExplanation`](../../../utils/explainMediaPath/interfaces/MediaPathExplanation.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:511

Explain why one absolute path is, or is not, in the media index (#848).

Admin-only diagnostic for "why isn't my file showing?" — #814 reported
media as undiscovered when in fact every missing file was correctly
skipped by a rule that leaves no visible trace.

Returns null when the configured provider cannot answer, rather than
inventing a verdict: a different provider has different rules, and a
confident wrong answer here sends the operator to fix the wrong thing.

#### Parameters

##### target

`string`

#### Returns

`Promise`\<[`MediaPathExplanation`](../../../utils/explainMediaPath/interfaces/MediaPathExplanation.md) \| `null`\>

***

### findByFilename()

> __findByFilename__(`filename`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:636

Find a media item by its original filename (basename).

Used to resolve `media://filename.jpg` URIs in wiki page content.
No privacy filtering is applied here — the caller (resolveAttachmentSrc)
only uses the resulting URL; actual file delivery goes through the
`/media/file/:id` route which enforces access control.

#### Parameters

##### filename

`string`

Basename to match (e.g. "IMG_1234.jpg").

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

The first matching MediaItem, or null if not found.

***

### get()

> __get__(`identifier`): `Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:249

CatalogSource.get — fetch a single media record by stable identifier
(the sha256-derived media id). Returns null for not-found and for
ACL-filtered (linked private page the caller can't access).

CatalogManager passes through any `WikiContext` it has via a future
`opts.wikiContext`; for the initial slice we accept no context and
therefore can't enforce private-page ACL here — callers that need
permission-aware access should continue using `getItem(id, ctx)`.

#### Parameters

##### identifier

`string`

#### Returns

`Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`get`](../../../types/Schema/interfaces/CatalogSource.md#get)

***

### getAllKeywordCounts()

> __getAllKeywordCounts__(): `Promise`\<`Record`\<`string`, `number`\>\>

Defined in: src/managers/MediaManager.ts:599

# 895: all distinct media keywords with item counts, for the admin keyword
drift report. Aggregate counts only (no item data) — admin-only caller;
counts include private items.

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>

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

### getItem()

> __getItem__(`id`, `wikiContext?`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:458

Retrieve a single media item, held to a share visitor's ceiling.

With a WikiContext whose subject arrived through a share, the item must
be covered by that share (PolicyInformationPoint.canUserAccessMediaItem);
a refusal returns null, treated as not found.

#### Parameters

##### id

`string`

Item identifier.

##### wikiContext?

[`default`](../../../context/WikiContext/classes/default.md)

Caller's WikiContext (pass undefined for admin/internal calls).

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

The MediaItem or null.

***

### getKeywordLeafPaths()

> __getKeywordLeafPaths__(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: src/managers/MediaManager.ts:609

# 917: library-wide leaf→path map from hierarchical media tags
(HierarchicalSubject / TagsList). Empty when the provider doesn't index
hierarchy. Consumed by #918 to preserve digiKam tag trees on write-back.

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

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

### getSkipReport()

> __getSkipReport__(): `Promise`\<[`MediaSkipReport`](../../../utils/explainMediaPath/interfaces/MediaSkipReport.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:531

The skip report from the most recent scan (#1056).

Answers "where did my file go?" across the whole library, where
[explainPath](#explainpath) answers it for one path the operator can already name.
Both exist because an operator who cannot find a file often cannot state
its path either.

Null when the provider keeps no report — the same reasoning as
`explainPath`: a different provider skips for different reasons, and an
empty report would be read as "nothing was skipped".

#### Returns

`Promise`\<[`MediaSkipReport`](../../../utils/explainMediaPath/interfaces/MediaSkipReport.md) \| `null`\>

***

### getThumbnailBuffer()

> __getThumbnailBuffer__(`id`, `size`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/managers/MediaManager.ts:648

Retrieve a thumbnail buffer for an item.

#### Parameters

##### id

`string`

Item identifier.

##### size

`string`

Requested size string (e.g. "300x300").

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

JPEG buffer or null.

***

### getTranscodedBuffer()

> __getTranscodedBuffer__(`id`, `format`): `Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Defined in: src/managers/MediaManager.ts:661

Return a transcoded full-resolution buffer for a HEIC/RAW item (#514).
Transcoded result is cached to the thumbnail directory.

#### Parameters

##### id

`string`

Item identifier.

##### format

`"jpeg"` \| `"webp"`

Target format: 'jpeg' or 'webp'.

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\> \| `null`\>

Transcoded buffer, or null if unavailable.

***

### getYears()

> __getYears__(): `Promise`\<`number`[]\>

Defined in: src/managers/MediaManager.ts:688

Return the list of years that have at least one media item, sorted
descending (most recent first).

#### Returns

`Promise`\<`number`[]\>

Sorted year list.

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/MediaManager.ts:93

Initialize the MediaManager.

- Creates the thumbnail directory if it does not exist.
- Instantiates the FileSystemMediaProvider with config-driven settings.
- Loads any existing media-index.json from disk (stub: no-op).
- Schedules a periodic background rescan based on ngdpbase.media.scaninterval.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration overrides (passed by BaseManager pattern).

#### Returns

`Promise`\<`void`\>

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

### list()

> __list__(`query`): `Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

Defined in: src/managers/MediaManager.ts:203

CatalogSource.list — query media records and emit CreativeWork shapes.

Currently maps `query.text` to the underlying provider's free-text search
and applies `types` filtering MIME-side. Cursor pagination is not yet
implemented (initial slice); `limit` caps the page size. Source-specific
filters live in `query.filters` and are ignored by this initial impl.

#### Parameters

##### query

[`CatalogQuery`](../../../types/Schema/interfaces/CatalogQuery.md)

#### Returns

`Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`list`](../../../types/Schema/interfaces/CatalogSource.md#list)

***

### listByDateRange()

> __listByDateRange__(`after?`, `before?`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/managers/MediaManager.ts:567

List media items whose capture timestamp falls within [after, before],
ascending by capture date (#864 — Dawarich adapter). Items without a
capture date are excluded by the provider.

#### Parameters

##### after?

`string`

Inclusive lower bound (ISO-ish string), optional.

##### before?

`string`

Inclusive upper bound (ISO-ish string), optional.

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

***

### listByKeyword()

> __listByKeyword__(`keyword`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/managers/MediaManager.ts:589

List all media items whose EXIF/XMP keywords contain the given keyword.

#### Parameters

##### keyword

`string`

Exact keyword to match (e.g. "Molly's Cooking").

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Array of MediaItem objects.

***

### listByPage()

> __listByPage__(`pageName`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/managers/MediaManager.ts:578

List all media items whose EXIF/XMP keywords name a wiki page.

#### Parameters

##### pageName

`string`

Wiki page name to match against each item's keywords.

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Array of MediaItem objects.

***

### listByYear()

> __listByYear__(`year`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/managers/MediaManager.ts:545

List all media items for a given year.

#### Parameters

##### year

`number`

Four-digit year.

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Array of MediaItem objects.

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

### rebuild()

> __rebuild__(`_opts?`): `Promise`\<`void`\>

Defined in: src/managers/MediaManager.ts:261

CatalogSource.rebuild — full media index rebuild. Wraps `rebuildIndex()`
so the CatalogSource contract is honoured even though MediaManager's
existing admin route prefers the named method.

#### Parameters

##### \_opts?

[`RebuildOpts`](../../../types/Schema/interfaces/RebuildOpts.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md).[`rebuild`](../../../types/Schema/interfaces/CatalogSource.md#rebuild)

***

### rebuildIndex()

> __rebuildIndex__(`onProgress?`): `Promise`\<[`ScanResult`](../../../BaseMediaProvider/interfaces/ScanResult.md)\>

Defined in: src/managers/MediaManager.ts:285

Rebuild the media index from scratch.

Clears the in-memory index, deletes the persisted index file, then runs a
full scan. All items on disk are re-indexed; stale entries for deleted
files are removed because the index starts empty.

#### Parameters

##### onProgress?

(`processed`, `total`) => `void`

#### Returns

`Promise`\<[`ScanResult`](../../../BaseMediaProvider/interfaces/ScanResult.md)\>

ScanResult summary.

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

### scanFolders()

> __scanFolders__(`force?`, `onProgress?`): `Promise`\<[`ScanResult`](../../../BaseMediaProvider/interfaces/ScanResult.md)\>

Defined in: src/managers/MediaManager.ts:428

Trigger a media folder scan.

STUB: Delegates to FileSystemMediaProvider.scan() which logs a warning and
returns an empty ScanResult. Real implementation comes in Phase 4.

#### Parameters

##### force?

`boolean`

Pass true to force a full rescan ignoring cached mtimes.

##### onProgress?

(`processed`, `total`) => `void`

#### Returns

`Promise`\<[`ScanResult`](../../../BaseMediaProvider/interfaces/ScanResult.md)\>

ScanResult summary.

***

### search()

> __search__(`query`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Defined in: src/managers/MediaManager.ts:620

Search media items.

#### Parameters

##### query

`string`

Search query string.

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md)[]\>

Array of MediaItem objects.

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/MediaManager.ts:697

Shut down the MediaManager, releasing provider resources. Its rescan
job is stopped by BackgroundJobManager's shutdown handoff (#1721).

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

***

### updateItemMetadata()

> __updateItemMetadata__(`id`, `patch`): `Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

Defined in: src/managers/MediaManager.ts:492

Update user-editable metadata (title, description, keywords,
dateTimeOriginal) on a media item. Writes into the source file's
EXIF/IPTC/XMP and refreshes the index entry.

Caller is responsible for the asset-edit permission check; this method
only enforces provider capability.

#### Parameters

##### id

`string`

Item identifier.

##### patch

[`AssetMetadataPatch`](../../../types/Asset/interfaces/AssetMetadataPatch.md)

Fields to change (absent = keep, null = clear).

#### Returns

`Promise`\<[`MediaItem`](../../../BaseMediaProvider/interfaces/MediaItem.md) \| `null`\>

The refreshed MediaItem, or null if the id is unknown (or the
         edit evicted the item, e.g. an ngdpbaseignore keyword).

#### Throws

Error when the provider lacks the 'edit' capability, the patch is
        invalid, or the underlying write fails.
