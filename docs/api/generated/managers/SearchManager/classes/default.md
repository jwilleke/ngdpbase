[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/SearchManager](../README.md) / default

# Class: default

Defined in: src/managers/SearchManager.ts:203

SearchManager - Handles search indexing and querying

Similar to JSPWiki's SearchManager, this manager provides full-text search
capabilities through a pluggable provider system. Supports different search
backends (Lunr.js, Elasticsearch, etc.) via provider abstraction.

Key features:

- Pluggable search provider system
- Full-text indexing of page content and metadata
- Configurable search ranking and filtering
- Automatic index rebuilding
- Provider abstraction for different search engines

Follows the provider pattern established in AttachmentManager, PageManager,
CacheManager, and AuditManager for pluggable search backends.

Configuration (all lowercase):

- ngdpbase.search.enabled - Enable/disable search
- ngdpbase.search.provider.default - Default provider name
- ngdpbase.search.provider - Active provider name
- ngdpbase.search.provider.lunr.* - LunrSearchProvider settings

 SearchManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- LunrSearchProvider for default provider implementation

## Example

```ts
const searchManager = engine.getManager('SearchManager');
const results = await searchManager.search('hello world');
console.log(`Found ${results.length} pages`);

Related: GitHub Issue #102 - Configuration reorganization
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `SearchManager`

Defined in: src/managers/SearchManager.ts:213

Creates a new SearchManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`SearchManager`

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

### addToIndex()

> __addToIndex__(`page`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:1066

Add page to search index

#### Parameters

##### page

`PageData`

Page object to add

#### Returns

`Promise`\<`void`\>

***

### ~~advancedSearch()~~

> __advancedSearch__(`options?`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:677

Advanced search with multiple criteria support

#### Parameters

##### options?

`AdvancedSearchOptions` = `{}`

Search options

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

#### Deprecated

Use advancedSearchWithContext() with WikiContext instead

***

### advancedSearchWithContext()

> __advancedSearchWithContext__(`wikiContext`, `options?`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:579

Advanced search with WikiContext

Performs advanced search with multiple criteria using WikiContext as the single source
of truth. Logs detailed search parameters with user context for analytics.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing user info

##### options?

`AdvancedSearchOptions` = `{}`

Search options

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

#### Async

#### Throws

If wikiContext is not provided

#### Example

```ts
const results = await searchManager.advancedSearchWithContext(wikiContext, {
  query: 'tutorial',
  categories: ['Documentation'],
  maxResults: 20
});
```

***

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/SearchManager.ts:1114

Backup search configuration and state

#### Returns

`Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Backup data

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

### buildSearchIndex()

> __buildSearchIndex__(): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:365

Build search index from all pages

#### Returns

`Promise`\<`void`\>

#### Throws

If index building fails

***

### getAllCategories()

> __getAllCategories__(): `Promise`\<`string`[]\>

Defined in: src/managers/SearchManager.ts:869

Get all unique categories from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of categories

***

### getAllDocuments()

> __getAllDocuments__(): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:986

#### Returns

`Promise`\<`SearchResult`[]\>

***

### getAllSystemKeywords()

> __getAllSystemKeywords__(): `Promise`\<`string`[]\>

Defined in: src/managers/SearchManager.ts:905

Return all systemKeywords present in the search index (union across all pages).
Used to populate the "Browse / Filter by System Keyword" UI (#509).
Returns [] if the active provider does not support this operation (e.g. Lunr).

#### Returns

`Promise`\<`string`[]\>

***

### getAllUserKeywords()

> __getAllUserKeywords__(): `Promise`\<`string`[]\>

Defined in: src/managers/SearchManager.ts:887

Get all unique user keywords from indexed documents

#### Returns

`Promise`\<`string`[]\>

List of user keywords

***

### getDocumentCount()

> __getDocumentCount__(): `Promise`\<`number`\>

Defined in: src/managers/SearchManager.ts:1034

Get the total number of indexed documents

#### Returns

`Promise`\<`number`\>

Number of documents

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

### getPageSystemKeywords()

> __getPageSystemKeywords__(`pageName`): `Promise`\<`string`[]\>

Defined in: src/managers/SearchManager.ts:936

Get systemKeywords stored in the search index for a specific page.
Returns auto-tagged terms added by TaggingService at index time (#507).
Returns [] if the active provider does not support this operation.

#### Parameters

##### pageName

`string`

#### Returns

`Promise`\<`string`[]\>

***

### getStatistics()

> __getStatistics__(): `Promise`\<`SearchStatistics`\>

Defined in: src/managers/SearchManager.ts:1004

Get search statistics

#### Returns

`Promise`\<`SearchStatistics`\>

Search statistics

***

### getSuggestions()

> __getSuggestions__(`partial`): `Promise`\<`string`[]\>

Defined in: src/managers/SearchManager.ts:717

Get search suggestions for autocomplete

#### Parameters

##### partial

`string`

Partial search term

#### Returns

`Promise`\<`string`[]\>

Suggested completions

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:234

Initialize the SearchManager and load the configured provider

Loads the search provider, builds the initial search index, and prepares
the search system for queries.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Throws

If ConfigurationManager is not available or provider fails to load

#### Example

```ts
await searchManager.initialize();
console.log('Search system ready');
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

### multiSearch()

> __multiSearch__(`criteria`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:1098

Perform multi-criteria search

#### Parameters

##### criteria

`AdvancedSearchOptions`

Search criteria object

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

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

### rebuildFromDisk()

> __rebuildFromDisk__(): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:748

# 724: true rebuild FROM DISK — clears the index + persisted cache and
re-scans every page, so entries for deleted pages ("ghosts") are
dropped by construction. This is the "Rebuild" to rebuildIndex()'s
"Reindex" (mirrors media.rebuild vs media.rescan). Providers that lack
a disk-reconciling rebuild fall back to the normal index build.

#### Returns

`Promise`\<`void`\>

***

### rebuildIndex()

> __rebuildIndex__(): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:735

Rebuild search index (called after page changes)

#### Returns

`Promise`\<`void`\>

***

### removeFromIndex()

> __removeFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:1082

Remove page from search index

#### Parameters

##### pageName

`string`

Name of page to remove

#### Returns

`Promise`\<`void`\>

***

### removePageFromIndex()

> __removePageFromIndex__(`pageName`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:800

Remove a page from the search index

#### Parameters

##### pageName

`string`

Page name to remove

#### Returns

`Promise`\<`void`\>

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:1148

Restore search from backup

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

Backup data

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

### ~~search()~~

> __search__(`query`, `options?`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:656

Search for pages matching the query

#### Parameters

##### query

`string`

Search query

##### options?

`SearchOptions` = `{}`

Search options

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

#### Deprecated

Use searchWithContext() with WikiContext instead

***

### searchByCategories()

> __searchByCategories__(`categories`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:818

Search by multiple categories

#### Parameters

##### categories

`string`[]

Array of category names to search

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

***

### searchByCategory()

> __searchByCategory__(`category`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:954

Search by category only

#### Parameters

##### category

`string`

Category to search for

#### Returns

`Promise`\<`SearchResult`[]\>

Pages in category

***

### searchByKeywords()

> __searchByKeywords__(`keywords`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:1053

Search by keywords

#### Parameters

##### keywords

`string`[]

Keywords to search for

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

***

### searchBySystemKeywordsList()

> __searchBySystemKeywordsList__(`keywords`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:921

Search pages that have all of the given system keywords.
Returns [] if provider does not support systemKeywords filtering.

#### Parameters

##### keywords

`string`[]

#### Returns

`Promise`\<`SearchResult`[]\>

***

### searchByUserKeywords()

> __searchByUserKeywords__(`keyword`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:973

Search by user keywords only

#### Parameters

##### keyword

`string`

Keyword to search for

#### Returns

`Promise`\<`SearchResult`[]\>

Pages with keyword

***

### searchByUserKeywordsList()

> __searchByUserKeywordsList__(`keywords`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:844

Search by multiple user keywords

#### Parameters

##### keywords

`string`[]

Array of user keywords to search

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

***

### searchWithContext()

> __searchWithContext__(`wikiContext`, `query`, `options?`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:403

Search for pages using WikiContext

Performs a search using WikiContext as the single source of truth for user information.
Logs search queries with user context for analytics and audit purposes.

#### Parameters

##### wikiContext

`WikiContext`

The wiki context containing user info

##### query

`string`

Search query

##### options?

`SearchOptions` = `{}`

Additional search options

#### Returns

`Promise`\<`SearchResult`[]\>

Search results

#### Async

#### Throws

If wikiContext is not provided

#### Example

```ts
const results = await searchManager.searchWithContext(wikiContext, 'hello world');
console.log(`Found ${results.length} pages`);
```

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:1167

Shutdown search manager and close provider

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

### suggestSimilarPages()

> __suggestSimilarPages__(`pageName`, `limit?`): `Promise`\<`SearchResult`[]\>

Defined in: src/managers/SearchManager.ts:698

Suggest similar pages based on content

#### Parameters

##### pageName

`string`

Source page name

##### limit?

`number` = `5`

Maximum suggestions

#### Returns

`Promise`\<`SearchResult`[]\>

Suggested pages

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

### updatePageInIndex()

> __updatePageInIndex__(`pageName`, `pageData`): `Promise`\<`void`\>

Defined in: src/managers/SearchManager.ts:773

Add/update a page in the search index

#### Parameters

##### pageName

`string`

Page name

##### pageData

`PageData`

Page data

#### Returns

`Promise`\<`void`\>
