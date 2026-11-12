[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/RenderingManager](../README.md) / default

# Class: default

Defined in: src/managers/RenderingManager.ts:111

RenderingManager - Handles markdown rendering and macro expansion

Similar to JSPWiki's RenderingManager, this manager orchestrates the conversion
of markdown/wiki markup to HTML. It supports both legacy direct markdown rendering
and the advanced MarkupParser with multi-phase processing.

Key features:

- Pluggable parser system (direct markdown-it vs MarkupParser)
- Wiki link parsing and resolution
- Link graph building for backlinks/orphaned pages
- Plugin and variable expansion integration
- Page name matching with plural support

 RenderingManager

## See

- [BaseManager](../../BaseManager/classes/default.md) for base functionality
- [MarkupParser](../../../parsers/MarkupParser/classes/default.md) for advanced parsing

## Example

```ts
const renderingManager = engine.getManager('RenderingManager');
const html = await renderingManager.renderPage('# Hello World', { pageName: 'Main' });
```

## Extends

- [`default`](../../BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `RenderingManager`

Defined in: src/managers/RenderingManager.ts:125

Creates a new RenderingManager instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`RenderingManager`

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

### addPageToCache()

> __addPageToCache__(`pageName`): `void`

Defined in: src/managers/RenderingManager.ts:1343

Add a page name to the cached list (for new pages)

#### Parameters

##### pageName

`string`

Name of the new page

#### Returns

`void`

***

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

### buildLinkGraph()

> __buildLinkGraph__(): `Promise`\<`void`\>

Defined in: src/managers/RenderingManager.ts:1104

Build link graph for referring pages

#### Returns

`Promise`\<`void`\>

***

### convertJSPWikiTableToMarkdown()

> __convertJSPWikiTableToMarkdown__(`tableContent`, `params`): `string`

Defined in: src/managers/RenderingManager.ts:548

Convert JSPWiki table syntax to markdown table syntax

#### Parameters

##### tableContent

`string`

JSPWiki table content

##### params

`TableParams`

Table parameters

#### Returns

`string`

Markdown table

***

### expandMacros()

> __expandMacros__(`content`, `pageName`, `userContext?`, `requestInfo?`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:677

Expand macros in content

#### Parameters

##### content

`string`

Content with macros

##### pageName

`string`

Current page name

##### userContext?

`UserContext` \| `null` = `null`

User context for authentication variables

##### requestInfo?

`RequestInfo` \| `null` = `null`

#### Returns

`Promise`\<`string`\>

Content with expanded macros

***

### expandSystemVariable()

> __expandSystemVariable__(`variable`, `pageName`, `userContext?`): `string`

Defined in: src/managers/RenderingManager.ts:839

Expand a single JSPWiki-style system variable

#### Parameters

##### variable

`string`

The variable name (including $)

##### pageName

`string`

Current page name

##### userContext?

`UserContext` \| `null` = `null`

User context for authentication variables

#### Returns

`string`

Expanded value

***

### expandSystemVariables()

> __expandSystemVariables__(`content`): `string`

Defined in: src/managers/RenderingManager.ts:925

Expand JSPWiki-style system variables (legacy method for compatibility)

#### Parameters

##### content

`string`

Content with system variables

#### Returns

`string`

Content with expanded system variables

***

### formatUptime()

> __formatUptime__(`seconds`): `string`

Defined in: src/managers/RenderingManager.ts:970

Format uptime in human-readable format

#### Parameters

##### seconds

`number`

Uptime in seconds

#### Returns

`string`

Formatted uptime

***

### generateStyledTable()

> __generateStyledTable__(`metadata`): `string`

Defined in: src/managers/RenderingManager.ts:622

Generate styled table HTML with CSS

#### Parameters

##### metadata

`TableParams` & `object`

Table styling metadata

#### Returns

`string`

Styled table opening tag with CSS

***

### getApplicationVersion()

> __getApplicationVersion__(): `string`

Defined in: src/managers/RenderingManager.ts:903

Get application version from package.json

#### Returns

`string`

Application version

***

### getBaseUrl()

> __getBaseUrl__(): `string`

Defined in: src/managers/RenderingManager.ts:988

Get the base URL for the application

#### Returns

`string`

Base URL

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

### getLinkGraph()

> __getLinkGraph__(): `LinkGraph`

Defined in: src/managers/RenderingManager.ts:1252

Get link graph

#### Returns

`LinkGraph`

Link graph object

***

### getLoginStatus()

> __getLoginStatus__(`userContext`): `string`

Defined in: src/managers/RenderingManager.ts:1447

Get current login status from user context

#### Parameters

##### userContext

`UserContext` \| `null`

User context object

#### Returns

`string`

Login status description

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

### getParser()

> __getParser__(): [`default`](../../../parsers/MarkupParser/classes/default.md) \| `null`

Defined in: src/managers/RenderingManager.ts:197

Get the MarkupParser instance (for WikiContext integration)

Returns the advanced MarkupParser if enabled and initialized, or null
if using legacy direct markdown rendering.

#### Returns

[`default`](../../../parsers/MarkupParser/classes/default.md) \| `null`

MarkupParser instance if available and enabled

#### Example

```ts
const parser = renderingManager.getParser();
if (parser) {
  const html = await parser.parse(content, options);
}
```

***

### getReferringPages()

> __getReferringPages__(`pageName`): `string`[]

Defined in: src/managers/RenderingManager.ts:1408

Get pages that refer to a specific page

#### Parameters

##### pageName

`string`

Target page name

#### Returns

`string`[]

Array of referring page names

#### Todo

SHOULD BE using plugins/referringPagesPlugin.js

***

### getTotalPagesCount()

> __getTotalPagesCount__(): `number`

Defined in: src/managers/RenderingManager.ts:882

Get total pages count
Uses the provider's page cache for an accurate count.
After installation, only counts pages from the main pages directory.

#### Returns

`number`

Number of pages

***

### getUptime()

> __getUptime__(): `number`

Defined in: src/managers/RenderingManager.ts:894

Get server uptime in seconds

#### Returns

`number`

Uptime in seconds

***

### getUserName()

> __getUserName__(`userContext`): `string`

Defined in: src/managers/RenderingManager.ts:1428

Get current username from user context

#### Parameters

##### userContext

`UserContext` \| `null`

User context object

#### Returns

`string`

Username or "Anonymous"

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/managers/RenderingManager.ts:147

Initialize the RenderingManager

Sets up the markdown converter, link parser, and rendering configuration.
Determines whether to use the advanced MarkupParser or the legacy direct converter.

#### Parameters

##### config?

`Record`\<`string`, `unknown`\> = `{}`

Configuration object (unused, reads from ConfigurationManager)

#### Returns

`Promise`\<`void`\>

#### Async

#### Example

```ts
await renderingManager.initialize();
console.log('RenderingManager ready');
```

#### Overrides

[`default`](../../BaseManager/classes/default.md).[`initialize`](../../BaseManager/classes/default.md#initialize)

***

### initializeLinkParser()

> __initializeLinkParser__(): `void`

Defined in: src/managers/RenderingManager.ts:1219

Initialize LinkParser with page names and configuration

#### Returns

`void`

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

### parseTableParameters()

> __parseTableParameters__(`paramString`): `TableParams`

Defined in: src/managers/RenderingManager.ts:516

Parse table parameters from JSPWiki Table plugin syntax

#### Parameters

##### paramString

`string`

Parameter string

#### Returns

`TableParams`

Parsed parameters

***

### performPerformanceComparison()

> __performPerformanceComparison__(`content`, `pageName`, `userContext`, `requestInfo`, `advancedTime`): `Promise`\<`void`\>

Defined in: src/managers/RenderingManager.ts:418

Perform performance comparison between advanced and legacy parsers (modular benchmarking)

#### Parameters

##### content

`string`

Content that was parsed

##### pageName

`string`

Page name

##### userContext

`UserContext` \| `null`

User context

##### requestInfo

`RequestInfo` \| `null`

Request information

##### advancedTime

`number`

Time taken by advanced parser

#### Returns

`Promise`\<`void`\>

***

### postProcessTables()

> __postProcessTables__(`html`): `string`

Defined in: src/managers/RenderingManager.ts:602

Post-process rendered HTML tables to apply JSPWiki styling

#### Parameters

##### html

`string`

Rendered HTML

#### Returns

`string`

HTML with styled tables

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

### processJSPWikiTables()

> __processJSPWikiTables__(`content`): `string`

Defined in: src/managers/RenderingManager.ts:452

Process JSPWiki-style table syntax with styling parameters

#### Parameters

##### content

`string`

Content with JSPWiki table syntax

#### Returns

`string`

Content with processed tables

***

### processTableStripedSyntax()

> __processTableStripedSyntax__(`content`): `string`

Defined in: src/managers/RenderingManager.ts:481

Process %%table-striped syntax for theme-based alternating rows

#### Parameters

##### content

`string`

Content with %%table-striped syntax

#### Returns

`string`

Content with processed tables

***

### processWikiLinks()

> __processWikiLinks__(`content`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:1001

Process wiki-style links [PageName]

#### Parameters

##### content

`string`

Content with wiki links

#### Returns

`Promise`\<`string`\>

Content with processed links

***

### rebuildLinkGraph()

> __rebuildLinkGraph__(): `Promise`\<`void`\>

Defined in: src/managers/RenderingManager.ts:1259

Rebuild link graph (called after page changes)

#### Returns

`Promise`\<`void`\>

***

### removePageFromLinkGraph()

> __removePageFromLinkGraph__(`pageName`): `void`

Defined in: src/managers/RenderingManager.ts:1371

Remove a page from the link graph and cached names (for deleted pages)

#### Parameters

##### pageName

`string`

Name of the deleted page

#### Returns

`void`

***

### renderMarkdown()

> __renderMarkdown__(`content`, `pageName`, `userContext?`, `requestInfo?`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:258

Render markdown content to HTML with MarkupParser integration

#### Parameters

##### content

`string`

Markdown content

##### pageName

`string`

Current page name

##### userContext?

`UserContext` \| `null` = `null`

User context for authentication variables

##### requestInfo?

`RequestInfo` \| `null` = `null`

Request information

#### Returns

`Promise`\<`string`\>

Rendered HTML

***

### renderPlugins()

> __renderPlugins__(`content`, `pageName`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:1487

Render plugins (JSPWiki-style plugins)

#### Parameters

##### content

`string`

Content with plugin syntax

##### pageName

`string`

Page name for plugin context

#### Returns

`Promise`\<`string`\>

Content with rendered plugins

***

### renderPreview()

> __renderPreview__(`content`, `pageName`, `userContext?`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:1419

Render page preview

#### Parameters

##### content

`string`

Markdown content

##### pageName

`string`

Page name for context

##### userContext?

`UserContext` \| `null` = `null`

User context for authentication variables

#### Returns

`Promise`\<`string`\>

Rendered HTML preview

***

### renderWikiLinks()

> __renderWikiLinks__(`content`): `string`

Defined in: src/managers/RenderingManager.ts:1466

Render wiki links (JSPWiki-style links) using LinkParser

#### Parameters

##### content

`string`

Content with wiki links

#### Returns

`string`

Content with rendered links

***

### renderWithAdvancedParser()

> __renderWithAdvancedParser__(`content`, `pageName`, `userContext`, `requestInfo`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:329

Render content using the advanced MarkupParser system

#### Parameters

##### content

`string`

Content to render

##### pageName

`string`

Page name

##### userContext

`UserContext` \| `null`

User context

##### requestInfo

`RequestInfo` \| `null`

Request information

#### Returns

`Promise`\<`string`\>

Rendered HTML

***

### renderWithLegacyParser()

> __renderWithLegacyParser__(`content`, `pageName`, `userContext`, `requestInfo`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:382

Render content using the legacy rendering system (backward compatibility)

#### Parameters

##### content

`string`

Content to render

##### pageName

`string`

Page name

##### userContext

`UserContext` \| `null`

User context

##### requestInfo

`RequestInfo` \| `null`

Request information

#### Returns

`Promise`\<`string`\>

Rendered HTML

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

### textToHTML()

> __textToHTML__(`context`, `content`): `Promise`\<`string`\>

Defined in: src/managers/RenderingManager.ts:1548

Converts wiki markup to HTML using the provided WikiContext.
This is the main entry point for the rendering pipeline.

#### Parameters

##### context

[`default`](../../../context/WikiContext/classes/default.md)

The context for the rendering operation.

##### content

`string`

The raw wiki markup to render.

#### Returns

`Promise`\<`string`\>

The rendered HTML.

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

### updatePageInLinkGraph()

> __updatePageInLinkGraph__(`pageName`, `content`): `void`

Defined in: src/managers/RenderingManager.ts:1271

Update link graph for a single page (incremental update)
Much faster than rebuildLinkGraph() for single page saves

#### Parameters

##### pageName

`string`

Name of the page that was modified

##### content

`string`

New content of the page

#### Returns

`void`
