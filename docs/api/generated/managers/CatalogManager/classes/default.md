[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/CatalogManager](../README.md) / default

# Class: default

Defined in: src/managers/CatalogManager.ts:266

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `CatalogManager`

Defined in: src/managers/CatalogManager.ts:281

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`CatalogManager`

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

> `readonly` __description__: `"Two-registry coordinator: vocabulary providers (#424) + asset sources (#755)"` = `'Two-registry coordinator: vocabulary providers (#424) + asset sources (#755)'`

Defined in: src/managers/CatalogManager.ts:267

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

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/CatalogManager.ts:595

# 896: back up the instance vocabulary store(s). Only provider-owned
instance data is included — the seed vocabulary ships with the code and
the AI provider owns no terms. Keyed by provider id so future
provider-owned stores slot in without a format change.

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

### checkSchemaVersions()

> __checkSchemaVersions__(): [`SchemaVersionReport`](../../../types/Schema/type-aliases/SchemaVersionReport.md)

Defined in: src/managers/CatalogManager.ts:536

Check whether each source's on-disk index is up to date with its in-code
`currentSchemaVersion` constant (Decision 6). Sources report `isStale =
true` when the index file lags behind code; the admin dashboard surfaces
a banner per stale source.

Each source is expected to compare its own on-disk version against
`currentSchemaVersion` and return both numbers. CatalogManager just
aggregates and routes the report to consumers.

#### Returns

[`SchemaVersionReport`](../../../types/Schema/type-aliases/SchemaVersionReport.md)

***

### getCanonicalKeywordMap()

> __getCanonicalKeywordMap__(`schemeId?`): `Promise`\<`Map`\<`string`, `string`\>\>

Defined in: src/managers/CatalogManager.ts:440

# 1467: canonical keyword value → the vocabulary's display title, for a
caller snapping a page's or an asset's keywords to the catalogued form.

This map is the vocabulary's own derived view, so it is declared here and
nowhere else. It used to be written out twice — once in `PageManager`
(#915) and once in `WikiRoutes` (#918) — and the `PageManager` copy cast
`getProviderTerms` to an array, which it has never returned. The cast is
what let the mismatch compile; `for...of` then threw on every page save
and the catch swallowed it, so keyword title-snapping never ran at all.

Best-effort by contract: an empty map when the vocabulary is unreachable,
so a caller's dedup still runs, just without title-snapping.

Only ENABLED terms are in the map — a disabled term is not part of the
vocabulary, so nothing should be snapped to it.

#### Parameters

##### schemeId?

`string` = `'user-keywords'`

#### Returns

`Promise`\<`Map`\<`string`, `string`\>\>

***

### getCreativeWork()

> __getCreativeWork__(`identifier`, `opts?`): `Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

Defined in: src/managers/CatalogManager.ts:475

Look up a single CreativeWork by stable identifier across all registered
sources. Returns the first non-null hit; returns null when no source has
the identifier or all matching sources filter it out via ACL.

Pass `opts.sourceId` to restrict the lookup to one source — useful when
the caller already knows which source owns the record.

#### Parameters

##### identifier

`string`

##### opts?

###### sourceId?

`string`

#### Returns

`Promise`\<[`CreativeWork`](../../../types/Schema/type-aliases/CreativeWork.md) \| `null`\>

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

Defined in: src/managers/CatalogManager.ts:568

# 1006: registered catalog sources, wrapping the existing getSourceInfo().

This is the shape #780's bespoke source list becomes one row of, which is
the point of the contract: a manager stops needing its own admin page.

#### Returns

`Promise`\<[`ManagerStats`](../../BaseManager/interfaces/ManagerStats.md)\>

#### Overrides

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

### getProviderInfo()

> __getProviderInfo__(): `object`[]

Defined in: src/managers/CatalogManager.ts:386

Return info about all registered providers (for admin UIs / diagnostics).

#### Returns

`object`[]

***

### getProviderTerms()

> __getProviderTerms__(`schemeId`): `Promise`\<\{ `displayName`: `string`; `terms`: [`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]; \} \| `null`\>

Defined in: src/managers/CatalogManager.ts:411

#### Parameters

##### schemeId

`string`

#### Returns

`Promise`\<\{ `displayName`: `string`; `terms`: [`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]; \} \| `null`\>

***

### getSourceInfo()

> __getSourceInfo__(): `object`[]

Defined in: src/managers/CatalogManager.ts:577

#### Returns

`object`[]

***

### getTerms()

> __getTerms__(`domain?`): `Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

Defined in: src/managers/CatalogManager.ts:333

Return all terms from all registered providers, merged in registration order.

#### Parameters

##### domain?

`string`

Optional domain filter — only includes providers with a matching domain
              (providers with no domain set are always included).

#### Returns

`Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

***

### getUserKeywordsProvider()

> __getUserKeywordsProvider__(): [`UserKeywordsCatalogProvider`](UserKeywordsCatalogProvider.md) \| `null`

Defined in: src/managers/CatalogManager.ts:406

# 896: typed accessor for the user-keywords provider — the write interface
for the instance vocabulary store (admin CRUD, drift Adopt, import
auto-register all go through it).

#### Returns

[`UserKeywordsCatalogProvider`](UserKeywordsCatalogProvider.md) \| `null`

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/CatalogManager.ts:289

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

### listCreativeWorks()

> __listCreativeWorks__(`query`): `Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

Defined in: src/managers/CatalogManager.ts:504

List CreativeWorks across registered sources matching the query.

When `query.types` is set, only sources advertising at least one of the
requested

#### Parameters

##### query

[`CatalogQuery`](../../../types/Schema/interfaces/CatalogQuery.md)

#### Returns

`Promise`\<[`CatalogPage`](../../../types/Schema/interfaces/CatalogPage.md)\>

#### Types

are queried. Cursors are scoped to a single source —
callers paginating across multiple sources receive items in source
registration order without a unified cursor (initial slice; can be
extended once a real consumer needs cross-source pagination).

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

### registerProvider()

> __registerProvider__(`provider`): `void`

Defined in: src/managers/CatalogManager.ts:323

Register a catalog provider.
Addons call this in their register() hook to contribute domain vocabularies.
Calling registerProvider() with an id that already exists replaces the prior provider.

#### Parameters

##### provider

[`CatalogProvider`](../../../types/Catalog/interfaces/CatalogProvider.md)

#### Returns

`void`

***

### registerSource()

> __registerSource__(`source`): `void`

Defined in: src/managers/CatalogManager.ts:462

Register an asset source (Slice 3 of #755).

PageManager, MediaManager, AttachmentManager call this during their own
`initialize()` to expose CreativeWork records via this Manager. Replacing
by `sourceId` is allowed (last registration wins).

#### Parameters

##### source

[`CatalogSource`](../../../types/Schema/interfaces/CatalogSource.md)

#### Returns

`void`

***

### resolveUri()

> __resolveUri__(`term`): `Promise`\<`string` \| `null`\>

Defined in: src/managers/CatalogManager.ts:351

Resolve a term string to a Linked-Data URI.
Walks providers in registration order; returns the first non-null hit.

#### Parameters

##### term

`string`

#### Returns

`Promise`\<`string` \| `null`\>

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/CatalogManager.ts:615

# 896: restore instance vocabulary store(s) written by backup().

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

#### Returns

`Promise`\<`void`\>

#### Overrides

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

### suggestTerms()

> __suggestTerms__(`content`, `title`): `Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

Defined in: src/managers/CatalogManager.ts:369

Suggest controlled-vocabulary terms for the given page content.
Delegates to any provider that implements suggestTerms().
Returns [] when no AI provider is wired or ai is disabled.

#### Parameters

##### content

`string`

##### title

`string`

#### Returns

`Promise`\<[`CatalogTerm`](../../../types/Catalog/interfaces/CatalogTerm.md)[]\>

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
