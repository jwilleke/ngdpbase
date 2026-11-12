[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / default

# Class: default

Defined in: src/parsers/MarkupParser.ts:355

## Extends

- [`default`](../../../managers/BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `MarkupParser`

Defined in: src/parsers/MarkupParser.ts:392

Creates a new MarkupParser instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`MarkupParser`

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`constructor`](../../../managers/BaseManager/classes/default.md#constructor)

## Properties

### cache

> __cache__: [`default`](../../../cache/RegionCache/classes/default.md) \| `null`

Defined in: src/parsers/MarkupParser.ts:363

Parse result cache

***

### cacheStrategies

> __cacheStrategies__: `Record`\<`string`, [`default`](../../../cache/RegionCache/classes/default.md)\>

Defined in: src/parsers/MarkupParser.ts:366

Caching strategies by content type

***

### config

> `protected` __config__: [`MarkupParserConfig`](../interfaces/MarkupParserConfig.md)

Defined in: src/parsers/MarkupParser.ts:387

Parser configuration - overrides BaseManager's generic config

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`config`](../../../managers/BaseManager/classes/default.md#config)

***

### description?

> `readonly` `optional` __description?__: `string`

Defined in: src/managers/BaseManager.ts:335

Short description of what this manager does.
Used by admin UIs, addon registries, and introspection tools.
Override in subclasses to provide a human-readable description.

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`description`](../../../managers/BaseManager/classes/default.md#description)

***

### domLinkHandler

> __domLinkHandler__: [`default`](../../dom/handlers/DOMLinkHandler/classes/default.md)

Defined in: src/parsers/MarkupParser.ts:384

Link resolution handler

***

### domParser

> __domParser__: [`DOMParser`](../../dom/DOMParser/classes/DOMParser.md)

Defined in: src/parsers/MarkupParser.ts:375

DOM-based parser for JSPWiki syntax

***

### domPluginHandler

> __domPluginHandler__: [`default`](../../dom/handlers/DOMPluginHandler/classes/default.md)

Defined in: src/parsers/MarkupParser.ts:381

Plugin execution handler

***

### domVariableHandler

> __domVariableHandler__: [`default`](../../dom/handlers/DOMVariableHandler/classes/default.md)

Defined in: src/parsers/MarkupParser.ts:378

Variable expansion handler

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/BaseManager.ts:319

Reference to the wiki engine

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`engine`](../../../managers/BaseManager/classes/default.md#engine)

***

### filterChain

> __filterChain__: [`default`](../../filters/FilterChain/classes/default.md) \| `null`

Defined in: src/parsers/MarkupParser.ts:360

Content filter chain

***

### handlerRegistry

> __handlerRegistry__: [`HandlerRegistry`](../../handlers/HandlerRegistry/classes/HandlerRegistry.md)

Defined in: src/parsers/MarkupParser.ts:357

Handler registry for syntax handlers

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/managers/BaseManager.ts:322

Initialization status flag

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`initialized`](../../../managers/BaseManager/classes/default.md#initialized)

***

### metrics

> __metrics__: [`ParserMetrics`](../interfaces/ParserMetrics.md)

Defined in: src/parsers/MarkupParser.ts:372

Parser performance metrics

***

### performanceMonitor

> __performanceMonitor__: [`PerformanceMonitor`](../interfaces/PerformanceMonitor.md) \| `null`

Defined in: src/parsers/MarkupParser.ts:369

Performance monitoring state

## Methods

### backup()

> __backup__(`_options?`): `Promise`\<[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)\>

Defined in: src/managers/BaseManager.ts:663

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

#### Parameters

##### \_options?

[`ManagerBackupOptions`](../../../managers/BaseManager/interfaces/ManagerBackupOptions.md)

#### Returns

`Promise`\<[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)\>

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

[`default`](../../../managers/BaseManager/classes/default.md).[`backup`](../../../managers/BaseManager/classes/default.md#backup)

***

### backupFolders()

> __backupFolders__(): [`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

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

[`BackupFolder`](../../../managers/BaseManager/type-aliases/BackupFolder.md)[]

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`backupFolders`](../../../managers/BaseManager/classes/default.md#backupfolders)

***

### cacheParseResult()

> __cacheParseResult__(`cacheKey`, `content`): `Promise`\<`void`\>

Defined in: src/parsers/MarkupParser.ts:3008

Cache parse result

#### Parameters

##### cacheKey

`string`

Cache key

##### content

`string`

Content to cache

#### Returns

`Promise`\<`void`\>

***

### checkPerformanceThresholds()

> __checkPerformanceThresholds__(): `void`

Defined in: src/parsers/MarkupParser.ts:3068

Check performance thresholds and generate alerts

#### Returns

`void`

***

### clearPerformanceAlerts()

> __clearPerformanceAlerts__(): `void`

Defined in: src/parsers/MarkupParser.ts:3167

Clear performance alerts

#### Returns

`void`

***

### createDOMNode()

> __createDOMNode__(`element`, `context`, `wikiDocument`): `Promise`\<`unknown`\>

Defined in: src/parsers/MarkupParser.ts:2520

Creates a DOM node from an extracted element (Phase 2 dispatcher)

This is the dispatcher method for Phase 2 that routes extracted elements
to the appropriate handler based on element type.

#### Parameters

##### element

[`ExtractedElement`](../interfaces/ExtractedElement.md)

Extracted element from extractJSPWikiSyntax()

##### context

[`ParseContext`](../../context/ParseContext/classes/ParseContext.md)

Rendering context

##### wikiDocument

[`default`](../../dom/WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`Promise`\<`unknown`\>

DOM node for the element

#### Example

```ts
const element = { type: 'variable', varName: '$username', id: 0 };
const node = await createDOMNode(element, context, wikiDoc);
// Returns: <span class="wiki-variable">JohnDoe</span>
```

***

### createNodeFromStyleBlock()

> __createNodeFromStyleBlock__(`element`, `context`, `wikiDocument`): `Promise`\<`unknown`\>

Defined in: src/parsers/MarkupParser.ts:1954

Creates a DOM node from a JSPWiki style block (%%class-name ... /%)

This handles table-related style classes (table-striped, sortable, etc.)
by parsing JSPWiki table syntax and creating HTML tables with proper styling.
For non-table styles, wraps content in a styled div/span.

#### Parameters

##### element

[`ExtractedElement`](../interfaces/ExtractedElement.md)

Extracted style element

##### context

[`ParseContext`](../../context/ParseContext/classes/ParseContext.md)

Rendering context

##### wikiDocument

[`default`](../../dom/WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`Promise`\<`unknown`\>

DOM node for the styled content

#### Example

```ts
// For table styles:
const element = { type: 'style', className: 'table-striped', styleContent: '|| H1 ||\n| D1 |' };
const node = createNodeFromStyleBlock(element, context, wikiDoc);
// Returns: <table class="table table-striped">...</table>
```

***

### createTextNodeForEscaped()

> __createTextNodeForEscaped__(`element`, `wikiDocument`): `unknown`

Defined in: src/parsers/MarkupParser.ts:1905

Creates a text node for escaped JSPWiki syntax

This is a helper method for Phase 2 DOM node creation (Issue #116).
Escaped syntax like [[{$var}]] should render as literal text [{$var}].

#### Parameters

##### element

[`ExtractedElement`](../interfaces/ExtractedElement.md)

Extracted escaped element

##### wikiDocument

[`default`](../../dom/WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`unknown`

DOM node containing the escaped literal text

#### Example

```ts
const element = { type: 'escaped', literal: '[{$username}]', id: 0, ... };
const node = createTextNodeForEscaped(element, wikiDoc);
// Returns: <span class="wiki-escaped" data-jspwiki-id="0">[{$username}]</span>
```

***

### disableHandler()

> __disableHandler__(`handlerId`): `boolean`

Defined in: src/parsers/MarkupParser.ts:998

Disable handler by ID

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`boolean`

True if successful

***

### enableHandler()

> __enableHandler__(`handlerId`): `boolean`

Defined in: src/parsers/MarkupParser.ts:989

Enable handler by ID

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`boolean`

True if successful

***

### extractJSPWikiSyntax()

> __extractJSPWikiSyntax__(`content`, `_context?`): `object`

Defined in: src/parsers/MarkupParser.ts:1367

Extract JSPWiki-specific syntax from content for DOM-based processing

This method implements the pre-extraction strategy from Issue #114.
Instead of tokenizing both markdown and JSPWiki syntax (which causes conflicts),
we extract ONLY JSPWiki syntax and let markdown-it handle all markdown.

Extraction order:

1. Variables: [{$username}] → __JSPWIKI_uuid_0__
2. Plugins: [{TableOfContents}] → __JSPWIKI_uuid_1__
3. Escaped: [[{$var}] → __JSPWIKI_uuid_2__ (stores literal [{$var}])
4. Wiki links: [PageName] → __JSPWIKI_uuid_3__ (but not markdown [text](url))

Code blocks are already protected by Phase 1 preprocessing, so JSPWiki syntax
inside code blocks won't be extracted.

#### Parameters

##### content

`string`

Raw wiki content

##### \_context?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`object`

- { sanitized, jspwikiElements, uuid }

Related: #114 (WikiDocument DOM Solution), #115 (Phase 1 Implementation)

##### jspwikiElements

> __jspwikiElements__: [`ExtractedElement`](../interfaces/ExtractedElement.md)[]

##### sanitized

> __sanitized__: `string`

##### uuid

> __uuid__: `string`

#### Example

```ts
const input = "## Heading\n\nUser: [{$username}]";
const { sanitized, jspwikiElements, uuid } = parser.extractJSPWikiSyntax(input);
// sanitized: "## Heading\n\nUser: <span data-jspwiki-placeholder="abc123-0"></span>"
// jspwikiElements: [{ type: 'variable', varName: '$username', id: 0, ... }]
// uuid: "abc123"
```

***

### generateCacheKey()

> __generateCacheKey__(`content`, `context`): `string`

Defined in: src/parsers/MarkupParser.ts:1161

#### Parameters

##### content

`string`

##### context

[`ParseContextData`](../interfaces/ParseContextData.md)

#### Returns

`string`

***

### generatePerformanceAlert()

> __generatePerformanceAlert__(`type`, `message`): `void`

Defined in: src/parsers/MarkupParser.ts:3122

Generate performance alert

#### Parameters

##### type

`string`

Alert type

##### message

`string`

Alert message

#### Returns

`void`

***

### getCachedParseResult()

> __getCachedParseResult__(`cacheKey`): `Promise`\<`string` \| `null`\>

Defined in: src/parsers/MarkupParser.ts:2990

Get cached parse result

#### Parameters

##### cacheKey

`string`

Cache key

#### Returns

`Promise`\<`string` \| `null`\>

Cached result or null

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

[`default`](../../../managers/BaseManager/classes/default.md).[`getEngine`](../../../managers/BaseManager/classes/default.md#getengine)

***

### getFilterChain()

> __getFilterChain__(): [`default`](../../filters/FilterChain/classes/default.md) \| `null`

Defined in: src/parsers/MarkupParser.ts:980

Get the FilterChain (#596), which FilterManager owns (#1117).

A delegating view kept for existing callers (the admin stats route,
legacy save-path lookups). New code should ask FilterManager directly.
Returns null when the pipeline is disabled or the manager is absent —
callers should treat a null chain as "validation skipped, proceed".

#### Returns

[`default`](../../filters/FilterChain/classes/default.md) \| `null`

The FilterChain instance, or null

***

### getHandler()

> __getHandler__(`handlerId`): `unknown`

Defined in: src/parsers/MarkupParser.ts:957

Get handler by ID

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`unknown`

Handler or null if not found

***

### getHandlerConfig()

> __getHandlerConfig__(`handlerType`): [`HandlerConfig`](../interfaces/HandlerConfig.md)

Defined in: src/parsers/MarkupParser.ts:939

Get configuration for a specific handler type

#### Parameters

##### handlerType

`string`

Handler type (plugin, wikitag, etc.)

#### Returns

[`HandlerConfig`](../interfaces/HandlerConfig.md)

Handler configuration

***

### getHandlers()

> __getHandlers__(`enabledOnly?`): `unknown`[]

Defined in: src/parsers/MarkupParser.ts:966

Get all handlers sorted by priority

#### Parameters

##### enabledOnly?

`boolean` = `true`

Only return enabled handlers

#### Returns

`unknown`[]

Handlers sorted by priority

***

### getHandlerTypeFromId()

> __getHandlerTypeFromId__(`handlerId`): `string` \| `null`

Defined in: src/parsers/MarkupParser.ts:912

Get handler type from handler ID for configuration lookup (modular mapping)

#### Parameters

##### handlerId

`string`

Handler ID

#### Returns

`string` \| `null`

Handler type or null

***

### getManagerStats()

> __getManagerStats__(): `Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

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

`Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Example

```ts
async getManagerStats(): Promise<ManagerStats> {
  const active = this.list('').filter((r) => !r.revokedAt);
  return { ...await super.getManagerStats(), count: active.length };
}
```

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`getManagerStats`](../../../managers/BaseManager/classes/default.md#getmanagerstats)

***

### getManagerStatus()

> __getManagerStatus__(): [`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md)

Defined in: src/managers/BaseManager.ts:528

What this manager is doing (#1155).

Not `getStatus()`: that name is already taken by `AddonsManager` and
`BackgroundJobManager` for entirely different things, and a base-class
method silently overridden by two subclasses would be worse than a longer
name.

#### Returns

[`ManagerStatus`](../../../managers/BaseManager/interfaces/ManagerStatus.md)

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`getManagerStatus`](../../../managers/BaseManager/classes/default.md#getmanagerstatus)

***

### getMetrics()

> __getMetrics__(): [`ExtendedMetrics`](../interfaces/ExtendedMetrics.md)

Defined in: src/parsers/MarkupParser.ts:2913

Get performance metrics

#### Returns

[`ExtendedMetrics`](../interfaces/ExtendedMetrics.md)

***

### getPerformanceAlerts()

> __getPerformanceAlerts__(): `unknown`[]

Defined in: src/parsers/MarkupParser.ts:3160

Get performance alerts

#### Returns

`unknown`[]

Array of performance alerts

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: src/parsers/MarkupParser.ts:431

Initialize the MarkupParser

#### Parameters

##### config?

`Partial`\<[`MarkupParserConfig`](../interfaces/MarkupParserConfig.md)\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`initialize`](../../../managers/BaseManager/classes/default.md#initialize)

***

### initializeAdvancedCaching()

> __initializeAdvancedCaching__(): `Promise`\<`void`\>

Defined in: src/parsers/MarkupParser.ts:687

Initialize advanced caching integration with multiple cache strategies

#### Returns

`Promise`\<`void`\>

***

### initializePerformanceMonitoring()

> __initializePerformanceMonitoring__(): `void`

Defined in: src/parsers/MarkupParser.ts:722

Initialize performance monitoring system

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

[`default`](../../../managers/BaseManager/classes/default.md).[`invalidateHandlerCache`](../../../managers/BaseManager/classes/default.md#invalidatehandlercache)

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: src/parsers/MarkupParser.ts:471

Check if MarkupParser is initialized (required for RenderingManager integration)

#### Returns

`boolean`

- True if initialized

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`isInitialized`](../../../managers/BaseManager/classes/default.md#isinitialized)

***

### loadConfiguration()

> __loadConfiguration__(): `void`

Defined in: src/parsers/MarkupParser.ts:583

Load configuration from ConfigurationManager

#### Returns

`void`

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

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

true when this is a TRANSITION — a state or reason that differs
  from the current one. Only a transition is an event: a manager that
  starts degraded and stays degraded must not re-emit on every boot, or
  the signal is buried in its own noise.

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markDegraded`](../../../managers/BaseManager/classes/default.md#markdegraded)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`markDisabled`](../../../managers/BaseManager/classes/default.md#markdisabled)

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

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markFailed`](../../../managers/BaseManager/classes/default.md#markfailed)

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

[`AttentionOptions`](../../../managers/BaseManager/type-aliases/AttentionOptions.md) = `{}`

#### Returns

`boolean`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`markNeedsAttention`](../../../managers/BaseManager/classes/default.md#markneedsattention)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`markReady`](../../../managers/BaseManager/classes/default.md#markready)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`markReadyIfDegradedBy`](../../../managers/BaseManager/classes/default.md#markreadyifdegradedby)

***

### mergeDOMNodes()

> __mergeDOMNodes__(`html`, `nodes`, `uuid`): `string`

Defined in: src/parsers/MarkupParser.ts:2671

Merges DOM nodes back into markdown-it HTML (Phase 3)

Replaces HTML comment placeholders (<!--JSPWIKI-uuid-id-->) in the HTML with
the rendered DOM nodes. Processes nodes in reverse ID order to
handle nested JSPWiki syntax correctly.

Uses HTML comments as placeholders to avoid markdown-it interpreting them as markdown.

#### Parameters

##### html

`string`

HTML from markdown-it with placeholders

##### nodes

`unknown`[]

Array of DOM nodes with data-jspwiki-id

##### uuid

`string`

UUID from extraction phase

#### Returns

`string`

Final HTML with nodes merged in

#### Example

```ts
// Input HTML: "<p>User: <!--JSPWIKI-abc123-0--></p>"
// Node 0: <span data-jspwiki-id="0">JohnDoe</span>
// Output: "<p>User: <span>JohnDoe</span></p>"
```

***

### parse()

> __parse__(`content`, `context?`): `Promise`\<`string`\>

Defined in: src/parsers/MarkupParser.ts:753

Main parsing method - uses WikiDocument DOM extraction pipeline

#### Parameters

##### content

`string`

Raw content to parse

##### context?

`Record`\<`string`, `unknown`\> = `{}`

Parsing context (page, user, etc.)

#### Returns

`Promise`\<`string`\>

Processed HTML content

***

### parseWithDOMExtraction()

> __parseWithDOMExtraction__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/MarkupParser.ts:2784

Parses wiki markup using DOM extraction strategy (Phase 1-3)

This is the new parsing method that implements the WikiDocument DOM solution:

1. Extract JSPWiki syntax (variables, plugins, links, escaped)
2. Create DOM nodes from extracted elements
3. Let markdown-it parse the sanitized markdown
4. Merge DOM nodes back into the HTML

This approach fixes the markdown heading bug by letting markdown-it handle
ALL markdown parsing while WikiDocument handles ONLY JSPWiki syntax.

#### Parameters

##### content

`string`

Wiki markup content

##### context

`Record`\<`string`, `unknown`\>

Rendering context

#### Returns

`Promise`\<`string`\>

Rendered HTML

#### Example

```ts
const html = await parser.parseWithDOMExtraction('## Hello\nUser: [{$username}]', context);
// Returns: "<h2>Hello</h2>\n<p>User: <span>JohnDoe</span></p>"
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

[`default`](../../../managers/BaseManager/classes/default.md).[`preflightConfiguredPath`](../../../managers/BaseManager/classes/default.md#preflightconfiguredpath)

***

### registerDefaultHandlers()

> __registerDefaultHandlers__(): `Promise`\<`void`\>

Defined in: src/parsers/MarkupParser.ts:480

Register default syntax handlers based on configuration

#### Returns

`Promise`\<`void`\>

***

### registerHandler()

> __registerHandler__(`handler`, `options?`): `Promise`\<`boolean`\>

Defined in: src/parsers/MarkupParser.ts:896

Register a syntax handler

#### Parameters

##### handler

[`default`](../../handlers/BaseSyntaxHandler/classes/default.md)

Handler instance

##### options?

`Record`\<`string`, `unknown`\> = `{}`

Registration options

#### Returns

`Promise`\<`boolean`\>

True if registration successful

***

### resetMetrics()

> __resetMetrics__(): `void`

Defined in: src/parsers/MarkupParser.ts:2974

Reset performance metrics

#### Returns

`void`

***

### restore()

> __restore__(`backupData`, `_options?`): `Promise`\<`void`\>

Defined in: src/managers/BaseManager.ts:691

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

##### \_options?

[`ManagerRestoreOptions`](../../../managers/BaseManager/interfaces/ManagerRestoreOptions.md)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`restore`](../../../managers/BaseManager/classes/default.md#restore)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`restoreIsStaged`](../../../managers/BaseManager/classes/default.md#restoreisstaged)

***

### safeGetManagerStats()

> __safeGetManagerStats__(): `Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

Defined in: src/managers/BaseManager.ts:819

`getManagerStats()` that cannot break the page it is rendered on.

The contract says an override must not throw, and saying so does not make
it true — an override reads a store, and a store can fail. This is what an
admin surface iterating every manager should call: one manager throwing
becomes one unhealthy row rather than a 500 for all of them.

#### Returns

`Promise`\<[`ManagerStats`](../../../managers/BaseManager/interfaces/ManagerStats.md)\>

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`safeGetManagerStats`](../../../managers/BaseManager/classes/default.md#safegetmanagerstats)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/MarkupParser.ts:3173

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

[`default`](../../../managers/BaseManager/classes/default.md).[`shutdown`](../../../managers/BaseManager/classes/default.md#shutdown)

***

### stagedRestoreAtStart()

> `protected` __stagedRestoreAtStart__(): [`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

Defined in: src/managers/BaseManager.ts:398

What this start did with a staged restore of this manager's declared parts (#1985): null when there was none.

#### Returns

[`StagedRestoreAtStart`](../../../managers/BaseManager/interfaces/StagedRestoreAtStart.md) \| `null`

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`stagedRestoreAtStart`](../../../managers/BaseManager/classes/default.md#stagedrestoreatstart)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`toFormOptions`](../../../managers/BaseManager/classes/default.md#toformoptions)

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

[`default`](../../../managers/BaseManager/classes/default.md).[`toMarqueeText`](../../../managers/BaseManager/classes/default.md#tomarqueetext)

***

### unregisterHandler()

> __unregisterHandler__(`handlerId`): `Promise`\<`boolean`\>

Defined in: src/parsers/MarkupParser.ts:948

Unregister a syntax handler

#### Parameters

##### handlerId

`string`

Handler identifier

#### Returns

`Promise`\<`boolean`\>

True if unregistration successful

***

### updateCacheMetrics()

> __updateCacheMetrics__(`strategy`, `operation`): `void`

Defined in: src/parsers/MarkupParser.ts:3028

Update cache metrics for specific strategy

#### Parameters

##### strategy

`string`

Cache strategy name

##### operation

`"miss"` \| `"set"` \| `"hit"`

Operation type (hit, miss, set)

#### Returns

`void`

***

### updatePerformanceMetrics()

> __updatePerformanceMetrics__(`processingTime`, `cacheHit`): `void`

Defined in: src/parsers/MarkupParser.ts:3044

Update performance metrics and check thresholds

#### Parameters

##### processingTime

`number`

Processing time in milliseconds

##### cacheHit

`boolean`

Whether this was a cache hit

#### Returns

`void`
