[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/RenderingManager](../README.md) / export=

# Class: export=

Defined in: [src/managers/RenderingManager.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L107)

RenderingManager - Handles markdown rendering and macro expansion

Similar to JSPWiki's RenderingManager, this manager orchestrates the conversion
of markdown/wiki markup to HTML. It supports both legacy Showdown-based rendering
and the advanced MarkupParser with multi-phase processing.

Key features:

- Pluggable parser system (Showdown vs MarkupParser)
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

> __new export=__(`engine`): `RenderingManager`

Defined in: [src/managers/RenderingManager.ts:121](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L121)

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

> `protected` `optional` __config__: `Record`\<`string`, `unknown`\>

Defined in: [src/managers/BaseManager.ts:61](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L61)

Configuration passed during initialization

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`config`](../../BaseManager/classes/default.md#config)

***

### engine

> `protected` __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: [src/managers/BaseManager.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L54)

Reference to the wiki engine

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`engine`](../../BaseManager/classes/default.md#engine)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/managers/BaseManager.ts:57](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L57)

Initialization status flag

#### Inherited from

[`default`](../../BaseManager/classes/default.md).[`initialized`](../../BaseManager/classes/default.md#initialized)

## Methods

### backup()

> __backup__(): `Promise`\<[`BackupData`](../../BaseManager/interfaces/BackupData.md)\>

Defined in: [src/managers/BaseManager.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L169)

Backup manager data

MUST be overridden by all managers that manage persistent data.
Default implementation returns an empty backup object.

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

### buildLinkGraph()

> __buildLinkGraph__(): `Promise`\<`void`\>

Defined in: [src/managers/RenderingManager.ts:1063](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1063)

Build link graph for referring pages

#### Returns

`Promise`\<`void`\>

***

### convertJSPWikiTableToMarkdown()

> __convertJSPWikiTableToMarkdown__(`tableContent`, `params`): `string`

Defined in: [src/managers/RenderingManager.ts:517](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L517)

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

> __expandMacros__(`content`, `pageName`, `userContext`, `_requestInfo`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:646](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L646)

Expand macros in content

#### Parameters

##### content

`string`

Content with macros

##### pageName

`string`

Current page name

##### userContext

User context for authentication variables

`UserContext` | `null`

##### \_requestInfo

`RequestInfo` | `null`

#### Returns

`Promise`\<`string`\>

Content with expanded macros

***

### expandSystemVariable()

> __expandSystemVariable__(`variable`, `pageName`, `userContext`): `string`

Defined in: [src/managers/RenderingManager.ts:807](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L807)

Expand a single JSPWiki-style system variable

#### Parameters

##### variable

`string`

The variable name (including $)

##### pageName

`string`

Current page name

##### userContext

User context for authentication variables

`UserContext` | `null`

#### Returns

`string`

Expanded value

***

### expandSystemVariables()

> __expandSystemVariables__(`content`): `string`

Defined in: [src/managers/RenderingManager.ts:893](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L893)

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

Defined in: [src/managers/RenderingManager.ts:938](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L938)

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

Defined in: [src/managers/RenderingManager.ts:591](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L591)

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

Defined in: [src/managers/RenderingManager.ts:871](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L871)

Get application version from package.json

#### Returns

`string`

Application version

***

### getBaseUrl()

> __getBaseUrl__(): `string`

Defined in: [src/managers/RenderingManager.ts:956](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L956)

Get the base URL for the application

#### Returns

`string`

Base URL

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

[`default`](../../BaseManager/classes/default.md).[`getEngine`](../../BaseManager/classes/default.md#getengine)

***

### getLinkGraph()

> __getLinkGraph__(): `LinkGraph`

Defined in: [src/managers/RenderingManager.ts:1190](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1190)

Get link graph

#### Returns

`LinkGraph`

Link graph object

***

### getLoginStatus()

> __getLoginStatus__(`userContext`): `string`

Defined in: [src/managers/RenderingManager.ts:1250](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1250)

Get current login status from user context

#### Parameters

##### userContext

User context object

`UserContext` | `null`

#### Returns

`string`

Login status description

***

### getParser()

> __getParser__(): [`default`](../../../parsers/MarkupParser/classes/default.md) \| `null`

Defined in: [src/managers/RenderingManager.ts:200](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L200)

Get the MarkupParser instance (for WikiContext integration)

Returns the advanced MarkupParser if enabled and initialized, or null
if using legacy Showdown rendering.

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

Defined in: [src/managers/RenderingManager.ts:1209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1209)

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

Defined in: [src/managers/RenderingManager.ts:850](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L850)

Get total pages count
Uses the provider's page cache for an accurate count.
After installation, only counts pages from the main pages directory.

#### Returns

`number`

Number of pages

***

### getUptime()

> __getUptime__(): `number`

Defined in: [src/managers/RenderingManager.ts:862](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L862)

Get server uptime in seconds

#### Returns

`number`

Uptime in seconds

***

### getUserName()

> __getUserName__(`userContext`): `string`

Defined in: [src/managers/RenderingManager.ts:1229](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1229)

Get current username from user context

#### Parameters

##### userContext

User context object

`UserContext` | `null`

#### Returns

`string`

Username or "Anonymous"

***

### initialize()

> __initialize__(`config?`): `Promise`\<`void`\>

Defined in: [src/managers/RenderingManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L143)

Initialize the RenderingManager

Sets up the markdown converter, link parser, and rendering configuration.
Determines whether to use the advanced MarkupParser or legacy Showdown converter.

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

Defined in: [src/managers/RenderingManager.ts:1157](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1157)

Initialize LinkParser with page names and configuration

#### Returns

`void`

***

### isInitialized()

> __isInitialized__(): `boolean`

Defined in: [src/managers/BaseManager.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L113)

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

### parseTableParameters()

> __parseTableParameters__(`paramString`): `TableParams`

Defined in: [src/managers/RenderingManager.ts:485](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L485)

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

Defined in: [src/managers/RenderingManager.ts:387](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L387)

Perform performance comparison between advanced and legacy parsers (modular benchmarking)

#### Parameters

##### content

`string`

Content that was parsed

##### pageName

`string`

Page name

##### userContext

User context

`UserContext` | `null`

##### requestInfo

Request information

`RequestInfo` | `null`

##### advancedTime

`number`

Time taken by advanced parser

#### Returns

`Promise`\<`void`\>

***

### postProcessTables()

> __postProcessTables__(`html`): `string`

Defined in: [src/managers/RenderingManager.ts:571](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L571)

Post-process rendered HTML tables to apply JSPWiki styling

#### Parameters

##### html

`string`

Rendered HTML

#### Returns

`string`

HTML with styled tables

***

### processJSPWikiTables()

> __processJSPWikiTables__(`content`): `string`

Defined in: [src/managers/RenderingManager.ts:421](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L421)

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

Defined in: [src/managers/RenderingManager.ts:450](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L450)

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

Defined in: [src/managers/RenderingManager.ts:969](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L969)

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

Defined in: [src/managers/RenderingManager.ts:1197](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1197)

Rebuild link graph (called after page changes)

#### Returns

`Promise`\<`void`\>

***

### renderMarkdown()

> __renderMarkdown__(`content`, `pageName`, `userContext`, `requestInfo`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:261](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L261)

Render markdown content to HTML with MarkupParser integration

#### Parameters

##### content

`string`

Markdown content

##### pageName

`string`

Current page name

##### userContext

User context for authentication variables

`UserContext` | `null`

##### requestInfo

Request information

`RequestInfo` | `null`

#### Returns

`Promise`\<`string`\>

Rendered HTML

***

### renderPlugins()

> __renderPlugins__(`content`, `pageName`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:1292](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1292)

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

> __renderPreview__(`content`, `pageName`, `userContext`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:1220](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1220)

Render page preview

#### Parameters

##### content

`string`

Markdown content

##### pageName

`string`

Page name for context

##### userContext

User context for authentication variables

`UserContext` | `null`

#### Returns

`Promise`\<`string`\>

Rendered HTML preview

***

### renderWikiLinks()

> __renderWikiLinks__(`content`): `string`

Defined in: [src/managers/RenderingManager.ts:1271](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1271)

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

Defined in: [src/managers/RenderingManager.ts:299](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L299)

Render content using the advanced MarkupParser system

#### Parameters

##### content

`string`

Content to render

##### pageName

`string`

Page name

##### userContext

User context

`UserContext` | `null`

##### requestInfo

Request information

`RequestInfo` | `null`

#### Returns

`Promise`\<`string`\>

Rendered HTML

***

### renderWithLegacyParser()

> __renderWithLegacyParser__(`content`, `pageName`, `userContext`, `requestInfo`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:351](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L351)

Render content using the legacy rendering system (backward compatibility)

#### Parameters

##### content

`string`

Content to render

##### pageName

`string`

Page name

##### userContext

User context

`UserContext` | `null`

##### requestInfo

Request information

`RequestInfo` | `null`

#### Returns

`Promise`\<`string`\>

Rendered HTML

***

### restore()

> __restore__(`backupData`): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:198](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L198)

Restore manager data from backup

MUST be overridden by all managers that manage persistent data.
Default implementation only validates that backup data is provided.

#### Parameters

##### backupData

[`BackupData`](../../BaseManager/interfaces/BackupData.md)

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

[`default`](../../BaseManager/classes/default.md).[`restore`](../../BaseManager/classes/default.md#restore)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/managers/BaseManager.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L143)

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

### textToHTML()

> __textToHTML__(`context`, `content`): `Promise`\<`string`\>

Defined in: [src/managers/RenderingManager.ts:1353](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/RenderingManager.ts#L1353)

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
