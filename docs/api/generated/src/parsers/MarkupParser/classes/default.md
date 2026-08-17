[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / default

# Class: default

Defined in: [src/parsers/MarkupParser.ts:351](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L351)

Base class for all managers

Provides common functionality for initialization, lifecycle management,
and backup/restore operations.

## Extends

- [`default`](../../../managers/BaseManager/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine`): `MarkupParser`

Defined in: [src/parsers/MarkupParser.ts:388](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L388)

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

Defined in: [src/parsers/MarkupParser.ts:359](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L359)

Parse result cache

***

### cacheStrategies

> __cacheStrategies__: `Record`\<`string`, [`default`](../../../cache/RegionCache/classes/default.md)\>

Defined in: [src/parsers/MarkupParser.ts:362](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L362)

Caching strategies by content type

***

### config

> `protected` __config__: [`MarkupParserConfig`](../interfaces/MarkupParserConfig.md)

Defined in: [src/parsers/MarkupParser.ts:383](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L383)

Parser configuration - overrides BaseManager's generic config

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`config`](../../../managers/BaseManager/classes/default.md#config)

***

### domLinkHandler

> __domLinkHandler__: [`default`](../../dom/handlers/DOMLinkHandler/classes/default.md)

Defined in: [src/parsers/MarkupParser.ts:380](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L380)

Link resolution handler

***

### domParser

> __domParser__: [`DOMParser`](../../dom/DOMParser/classes/DOMParser.md)

Defined in: [src/parsers/MarkupParser.ts:371](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L371)

DOM-based parser for JSPWiki syntax

***

### domPluginHandler

> __domPluginHandler__: [`default`](../../dom/handlers/DOMPluginHandler/classes/default.md)

Defined in: [src/parsers/MarkupParser.ts:377](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L377)

Plugin execution handler

***

### domVariableHandler

> __domVariableHandler__: [`default`](../../dom/handlers/DOMVariableHandler/classes/default.md)

Defined in: [src/parsers/MarkupParser.ts:374](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L374)

Variable expansion handler

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`engine`](../../../managers/BaseManager/classes/default.md#engine)

***

### filterChain

> __filterChain__: [`default`](../../filters/FilterChain/classes/default.md) \| `null`

Defined in: [src/parsers/MarkupParser.ts:356](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L356)

Content filter chain

***

### handlerRegistry

> __handlerRegistry__: [`HandlerRegistry`](../../handlers/HandlerRegistry/classes/HandlerRegistry.md)

Defined in: [src/parsers/MarkupParser.ts:353](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L353)

Handler registry for syntax handlers

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../../managers/BaseManager/classes/default.md).[`initialized`](../../../managers/BaseManager/classes/default.md#initialized)

***

### metrics

> __metrics__: [`ParserMetrics`](../interfaces/ParserMetrics.md)

Defined in: [src/parsers/MarkupParser.ts:368](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L368)

Parser performance metrics

***

### performanceMonitor

> __performanceMonitor__: [`PerformanceMonitor`](../interfaces/PerformanceMonitor.md) \| `null`

Defined in: [src/parsers/MarkupParser.ts:365](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L365)

Performance monitoring state

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

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

### cacheHandlerResult()

> __cacheHandlerResult__(`handlerId`, `contentHash`, `contextHash`, `result`): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:1613](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1613)

Cache handler result

#### Parameters

##### handlerId

`string`

Handler ID

##### contentHash

`string`

Content hash

##### contextHash

`string`

Context hash

##### result

`string`

Result to cache

#### Returns

`Promise`\<`void`\>

***

### cacheParseResult()

> __cacheParseResult__(`cacheKey`, `content`): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:1562](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1562)

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

Defined in: [src/parsers/MarkupParser.ts:1674](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1674)

Check performance thresholds and generate alerts

#### Returns

`void`

***

### clearPerformanceAlerts()

> __clearPerformanceAlerts__(): `void`

Defined in: [src/parsers/MarkupParser.ts:1773](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1773)

Clear performance alerts

#### Returns

`void`

***

### createDOMNode()

> __createDOMNode__(`element`, `context`, `wikiDocument`): `Promise`\<`unknown`\>

Defined in: [src/parsers/MarkupParser.ts:1280](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1280)

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

### createTextNodeForEscaped()

> __createTextNodeForEscaped__(`element`, `wikiDocument`): `unknown`

Defined in: [src/parsers/MarkupParser.ts:1250](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1250)

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

Defined in: [src/parsers/MarkupParser.ts:1084](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1084)

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

Defined in: [src/parsers/MarkupParser.ts:1075](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1075)

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

> __extractJSPWikiSyntax__(`content`, `_context`): `object`

Defined in: [src/parsers/MarkupParser.ts:1136](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1136)

Extract JSPWiki-specific syntax from content for DOM-based processing

This method implements the pre-extraction strategy from Issue #114.
Instead of tokenizing both markdown and JSPWiki syntax (which causes conflicts),
we extract ONLY JSPWiki syntax and let Showdown handle all markdown.

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

##### \_context

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

Defined in: [src/parsers/MarkupParser.ts:1094](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1094)

Generate cache key for content and context

#### Parameters

##### content

`string`

Content to cache

##### context

[`ParseContextData`](../interfaces/ParseContextData.md)

Parse context

#### Returns

`string`

Cache key

***

### generatePerformanceAlert()

> __generatePerformanceAlert__(`type`, `message`): `void`

Defined in: [src/parsers/MarkupParser.ts:1728](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1728)

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

### getCachedHandlerResult()

> __getCachedHandlerResult__(`handlerId`, `contentHash`, `contextHash`): `Promise`\<`string` \| `null`\>

Defined in: [src/parsers/MarkupParser.ts:1584](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1584)

Get cached handler result

#### Parameters

##### handlerId

`string`

Handler ID

##### contentHash

`string`

Content hash

##### contextHash

`string`

Context hash

#### Returns

`Promise`\<`string` \| `null`\>

Cached result or null

***

### getCachedParseResult()

> __getCachedParseResult__(`cacheKey`): `Promise`\<`string` \| `null`\>

Defined in: [src/parsers/MarkupParser.ts:1544](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1544)

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

Defined in: [src/managers/BaseManager.ts:125](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L125)

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

### getHandler()

> __getHandler__(`handlerId`): `unknown`

Defined in: [src/parsers/MarkupParser.ts:1057](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1057)

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

Defined in: [src/parsers/MarkupParser.ts:1039](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1039)

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

> __getHandlers__(`enabledOnly`): `unknown`[]

Defined in: [src/parsers/MarkupParser.ts:1066](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1066)

Get all handlers sorted by priority

#### Parameters

##### enabledOnly

`boolean` = `true`

Only return enabled handlers

#### Returns

`unknown`[]

Handlers sorted by priority

***

### getHandlerTypeFromId()

> __getHandlerTypeFromId__(`handlerId`): `string` \| `null`

Defined in: [src/parsers/MarkupParser.ts:1011](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1011)

Get handler type from handler ID for configuration lookup (modular mapping)

#### Parameters

##### handlerId

`string`

Handler ID

#### Returns

`string` \| `null`

Handler type or null

***

### getMetrics()

> __getMetrics__(): [`ExtendedMetrics`](../interfaces/ExtendedMetrics.md)

Defined in: [src/parsers/MarkupParser.ts:1467](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1467)

Get performance metrics

#### Returns

[`ExtendedMetrics`](../interfaces/ExtendedMetrics.md)

***

### getPerformanceAlerts()

> __getPerformanceAlerts__(): `unknown`[]

Defined in: [src/parsers/MarkupParser.ts:1766](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1766)

Get performance alerts

#### Returns

`unknown`[]

Array of performance alerts

***

### initialize()

> __initialize__(`config`): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:426](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L426)

Initialize the MarkupParser

#### Parameters

##### config

`Partial`\<[`MarkupParserConfig`](../interfaces/MarkupParserConfig.md)\> = `{}`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`initialize`](../../../managers/BaseManager/classes/default.md#initialize)

***

### initializeAdvancedCaching()

> __initializeAdvancedCaching__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:774](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L774)

Initialize advanced caching integration with multiple cache strategies

#### Returns

`Promise`\<`void`\>

***

### initializeFilterChain()

> __initializeFilterChain__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:468](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L468)

Initialize filter chain with modular configuration

#### Returns

`Promise`\<`void`\>

***

### initializePerformanceMonitoring()

> __initializePerformanceMonitoring__(): `void`

Defined in: [src/parsers/MarkupParser.ts:829](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L829)

Initialize performance monitoring system

#### Returns

`void`

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/parsers/MarkupParser.ts:461](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L461)

Check if MarkupParser is initialized (required for RenderingManager integration)

#### Returns

`boolean`

- True if initialized

#### Overrides

[`default`](../../../managers/BaseManager/classes/default.md).[`isInitialized`](../../../managers/BaseManager/classes/default.md#isinitialized)

***

### loadConfiguration()

> __loadConfiguration__(): `void`

Defined in: [src/parsers/MarkupParser.ts:646](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L646)

Load configuration from ConfigurationManager

#### Returns

`void`

***

### mergeDOMNodes()

> __mergeDOMNodes__(`html`, `nodes`, `uuid`): `string`

Defined in: [src/parsers/MarkupParser.ts:1345](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1345)

Merges DOM nodes back into Showdown-generated HTML (Phase 3)

Replaces HTML comment placeholders (<!--JSPWIKI-uuid-id-->) in the HTML with
the rendered DOM nodes. Processes nodes in reverse ID order to
handle nested JSPWiki syntax correctly.

Uses HTML comments as placeholders to avoid Showdown interpreting them as markdown.

#### Parameters

##### html

`string`

HTML from Showdown with placeholders

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

> __parse__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/MarkupParser.ts:922](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L922)

Main parsing method - uses WikiDocument DOM extraction pipeline

#### Parameters

##### content

`string`

Raw content to parse

##### context

`Record`\<`string`, `unknown`\> = `{}`

Parsing context (page, user, etc.)

#### Returns

`Promise`\<`string`\>

Processed HTML content

***

### parseWithDOMExtraction()

> __parseWithDOMExtraction__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/MarkupParser.ts:1408](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1408)

Parses wiki markup using DOM extraction strategy (Phase 1-3)

This is the new parsing method that implements the WikiDocument DOM solution:

1. Extract JSPWiki syntax (variables, plugins, links, escaped)
2. Create DOM nodes from extracted elements
3. Let Showdown parse the sanitized markdown
4. Merge DOM nodes back into the HTML

This approach fixes the markdown heading bug by letting Showdown handle
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

### performCacheWarmup()

> __performCacheWarmup__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:851](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L851)

Perform cache warmup for frequently accessed content

#### Returns

`Promise`\<`void`\>

***

### registerDefaultFilters()

> __registerDefaultFilters__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:492](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L492)

Register default filters based on modular configuration

#### Returns

`Promise`\<`void`\>

***

### registerDefaultHandlers()

> __registerDefaultHandlers__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:540](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L540)

Register default syntax handlers based on configuration

#### Returns

`Promise`\<`void`\>

***

### registerHandler()

> __registerHandler__(`handler`, `options`): `Promise`\<`boolean`\>

Defined in: [src/parsers/MarkupParser.ts:995](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L995)

Register a syntax handler

#### Parameters

##### handler

[`default`](../../handlers/BaseSyntaxHandler/classes/default.md)

Handler instance

##### options

`Record`\<`string`, `unknown`\> = `{}`

Registration options

#### Returns

`Promise`\<`boolean`\>

True if registration successful

***

### resetMetrics()

> __resetMetrics__(): `void`

Defined in: [src/parsers/MarkupParser.ts:1528](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1528)

Reset performance metrics

#### Returns

`void`

***

### resolveSystemVariable()

> __resolveSystemVariable__(`varName`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/MarkupParser.ts:900](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L900)

Resolve system variable for cache warmup

#### Parameters

##### varName

`string`

Variable name

##### context

`Record`\<`string`, `unknown`\>

Context object

#### Returns

`Promise`\<`string`\>

Variable value

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../../managers/BaseManager/interfaces/BackupData.md)

Backup data object from backup() method

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

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/MarkupParser.ts:1779](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1779)

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

### unregisterHandler()

> __unregisterHandler__(`handlerId`): `Promise`\<`boolean`\>

Defined in: [src/parsers/MarkupParser.ts:1048](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1048)

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

Defined in: [src/parsers/MarkupParser.ts:1634](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1634)

Update cache metrics for specific strategy

#### Parameters

##### strategy

`string`

Cache strategy name

##### operation

Operation type (hit, miss, set)

`"set"` | `"hit"` | `"miss"`

#### Returns

`void`

***

### updatePerformanceMetrics()

> __updatePerformanceMetrics__(`processingTime`, `cacheHit`): `void`

Defined in: [src/parsers/MarkupParser.ts:1650](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L1650)

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
