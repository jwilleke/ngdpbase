[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [parsers/dom/handlers/DOMPluginHandler](../README.md) / default

# Class: default

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:157

DOMPluginHandler class

## Constructors

### Constructor

> __new default__(`engine`): `DOMPluginHandler`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:169

Creates a new DOMPluginHandler

#### Parameters

##### engine

`WikiEngine`

WikiEngine instance

#### Returns

`DOMPluginHandler`

## Properties

### pluginManager

> `protected` __pluginManager__: `PluginManager` \| `null`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:162

PluginManager instance (loaded dynamically)

## Methods

### createNodeFromExtract()

> __createNodeFromExtract__(`element`, `context`, `wikiDocument`): `Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:444

Creates a DOM node from an extracted plugin element

This method is part of the Phase 2 extraction-based parsing (Issue #114).
It creates a plugin node from a pre-extracted element and executes the plugin.

#### Parameters

##### element

[`ExtractedPluginElement`](../interfaces/ExtractedPluginElement.md)

Extracted element from extractJSPWikiSyntax()

##### context

[`PluginContext`](../interfaces/PluginContext.md)

Rendering context

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

DOM node for the plugin

#### Example

```ts
const element = { type: 'plugin', inner: 'TableOfContents', id: 1, ... };
const node = await handler.createNodeFromExtract(element, context, wikiDoc);
// Returns: <span class="wiki-plugin" data-plugin="TableOfContents">...plugin output...</span>
```

***

### executePlugin()

> __executePlugin__(`pluginName`, `parameters`, `context`, `pluginElement`): `Promise`\<`string` \| `null`\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:371

Executes a plugin through PluginManager

#### Parameters

##### pluginName

`string`

Name of the plugin

##### parameters

`Record`\<`string`, `string`\>

Plugin parameters

##### context

[`PluginContext`](../interfaces/PluginContext.md)

Rendering context

##### pluginElement

`unknown`

The plugin DOM element

#### Returns

`Promise`\<`string` \| `null`\>

Plugin output HTML or null

***

### getStatistics()

> __getStatistics__(`wikiDocument`): [`PluginStatistics`](../interfaces/PluginStatistics.md)

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:547

Gets statistics about plugin processing

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

Document to analyze

#### Returns

[`PluginStatistics`](../interfaces/PluginStatistics.md)

Statistics

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:178

Initializes the handler

#### Returns

`Promise`\<`void`\>

***

### parseParameters()

> __parseParameters__(`paramString`): `Record`\<`string`, `string`\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:331

Parses parameter string into object

#### Parameters

##### paramString

`string`

Parameter string (e.g., "max=3 show=true")

#### Returns

`Record`\<`string`, `string`\>

Parsed parameters

***

### parsePluginContent()

> __parsePluginContent__(`pluginContent`): [`PluginInfo`](../interfaces/PluginInfo.md) \| `null`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:301

Parses plugin content string into name and parameters

#### Parameters

##### pluginContent

`string`

Plugin content (e.g., "TableOfContents max=3")

#### Returns

[`PluginInfo`](../interfaces/PluginInfo.md) \| `null`

{ pluginName, parameters } or null if invalid

***

### processPlugins()

> __processPlugins__(`wikiDocument`, `context`): `Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:193

Processes plugins in a WikiDocument

Queries for .wiki-plugin elements and executes them.
This is the DOM-based equivalent of PluginSyntaxHandler.process()

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

The WikiDocument to process

##### context

[`PluginContext`](../interfaces/PluginContext.md)

Rendering context

#### Returns

`Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Updated WikiDocument
