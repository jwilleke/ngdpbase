[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [parsers/dom/handlers/DOMLinkHandler](../README.md) / default

# Class: default

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:215

DOMLinkHandler class

## Constructors

### Constructor

> __new default__(`engine`): `DOMLinkHandler`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:236

Creates a new DOMLinkHandler

#### Parameters

##### engine

`WikiEngine`

WikiEngine instance

#### Returns

`DOMLinkHandler`

## Methods

### addPageName()

> __addPageName__(`pageName`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:967

Add a single page name to the known pages set (incremental update on page create/rename).
Avoids the full getAllPages() reload cost of refreshPageNames().

#### Parameters

##### pageName

`string`

Page name to add

#### Returns

`void`

***

### createNodeFromExtract()

> __createNodeFromExtract__(`element`, `context`, `wikiDocument`): `Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:683

Creates a DOM node from an extracted link element

This method is part of the Phase 2 extraction-based parsing (Issue #114).
It creates a link node from a pre-extracted element instead of parsing tokens.

#### Parameters

##### element

[`ExtractedLinkElement`](../interfaces/ExtractedLinkElement.md)

Extracted element from extractJSPWikiSyntax()

##### context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context; `pageOwner` selects the store a `[store/Title]` link resolves in (#1457)

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

DOM node for the link

#### Examples

```ts
const element = { type: 'link', target: 'PageName', id: 0, ... };
const node = await handler.createNodeFromExtract(element, context, wikiDoc);
// Returns: <a class="wiki-link wikipage" href="/view/PageName" data-jspwiki-id="0">PageName</a>
```

```ts
const element = { type: 'link', target: 'Click Here|PageName', id: 1, ... };
const node = await handler.createNodeFromExtract(element, context, wikiDoc);
// Returns: <a class="wiki-link wikipage" href="/view/PageName" data-jspwiki-id="1">Click Here</a>
```

***

### getStatistics()

> __getStatistics__(`wikiDocument`): [`LinkStatistics`](../interfaces/LinkStatistics.md)

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:910

Gets statistics about link processing

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

Document to analyze

#### Returns

[`LinkStatistics`](../interfaces/LinkStatistics.md)

Statistics

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:247

Initializes the handler

#### Returns

`Promise`\<`void`\>

***

### loadInterWikiConfiguration()

> __loadInterWikiConfiguration__(): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:303

Load InterWiki site configuration

#### Returns

`void`

***

### loadPageNames()

> __loadPageNames__(): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:270

Load page names from PageManager

#### Returns

`Promise`\<`void`\>

***

### processAnchorLink()

> __processAnchorLink__(`linkElement`, `linkInfo`, `_context`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:644

Process anchor link

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### \_context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context (unused)

#### Returns

`void`

***

### processEmailLink()

> __processEmailLink__(`linkElement`, `linkInfo`, `_context`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:625

Process email link

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### \_context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context (unused)

#### Returns

`void`

***

### processExternalLink()

> __processExternalLink__(`linkElement`, `linkInfo`, `_context`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:544

Process external link

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### \_context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context (unused)

#### Returns

`void`

***

### processInternalLink()

> __processInternalLink__(`linkElement`, `linkInfo`, `_context`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:491

Process internal wiki link

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### \_context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context (unused)

#### Returns

`void`

***

### processInterWikiLink()

> __processInterWikiLink__(`linkElement`, `linkInfo`, `_context`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:569

Process InterWiki link

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### \_context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context (unused)

#### Returns

`void`

***

### processLinkByType()

> __processLinkByType__(`linkElement`, `linkInfo`, `linkType`, `context`): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:461

Process a link element based on its type

#### Parameters

##### linkElement

[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)

The link DOM element

##### linkInfo

[`LinkInfo`](../interfaces/LinkInfo.md)

Link information

##### linkType

[`LinkType`](../type-aliases/LinkType.md)

Link type

##### context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context

#### Returns

`Promise`\<`void`\>

***

### processLinks()

> __processLinks__(`wikiDocument`, `context`): `Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:365

Processes links in a WikiDocument

Queries for .wiki-link elements and updates them with proper href and attributes.
This is the DOM-based equivalent of LinkParserHandler.process()

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

The WikiDocument to process

##### context

[`RenderContext`](../interfaces/RenderContext.md)

Rendering context

#### Returns

`Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Updated WikiDocument

***

### refreshPageNames()

> __refreshPageNames__(): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:956

Refresh page names cache (called when pages are added/removed)

#### Returns

`Promise`\<`void`\>

***

### removePageName()

> __removePageName__(`pageName`): `void`

Defined in: src/parsers/dom/handlers/DOMLinkHandler.ts:978

Remove a single page name from the known pages set (incremental update on page delete/rename).

#### Parameters

##### pageName

`string`

Page name to remove

#### Returns

`void`
