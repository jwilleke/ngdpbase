[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [parsers/dom/handlers/DOMVariableHandler](../README.md) / default

# Class: default

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:121

DOMVariableHandler class

## Constructors

### Constructor

> __new default__(`engine`): `DOMVariableHandler`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:133

Creates a new DOMVariableHandler

#### Parameters

##### engine

`WikiEngine`

WikiEngine instance

#### Returns

`DOMVariableHandler`

## Properties

### variableManager

> `protected` __variableManager__: `VariableManager` \| `null`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:126

VariableManager instance (loaded dynamically)

## Methods

### createNodeFromExtract()

> __createNodeFromExtract__(`element`, `context`, `wikiDocument`): `Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:285

Creates a DOM node from an extracted variable element

This method is part of the Phase 2 extraction-based parsing (Issue #114).
It creates a variable node from a pre-extracted element instead of
parsing it from tokens.

#### Parameters

##### element

[`ExtractedElement`](../interfaces/ExtractedElement.md)

Extracted element from extractJSPWikiSyntax()

##### context

[`VariableContext`](../interfaces/VariableContext.md)

Rendering context

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

WikiDocument to create node in

#### Returns

`Promise`\<[`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md)\>

DOM node for the variable

#### Example

```ts
const element = { type: 'variable', varName: '$username', id: 0, ... };
const node = await handler.createNodeFromExtract(element, context, wikiDoc);
// Returns: <span class="wiki-variable" data-variable="username">JohnDoe</span>
```

***

### getStatistics()

> __getStatistics__(`wikiDocument`): [`VariableStatistics`](../interfaces/VariableStatistics.md)

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:331

Gets statistics about variable processing

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

Document to analyze

#### Returns

[`VariableStatistics`](../interfaces/VariableStatistics.md)

Statistics

***

### initialize()

> __initialize__(): `Promise`\<`void`\>

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:142

Initializes the handler

#### Returns

`Promise`\<`void`\>

***

### processVariables()

> __processVariables__(`wikiDocument`, `context`): `Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:157

Processes variables in a WikiDocument

Queries for .wiki-variable elements and resolves their values.
This is the DOM-based equivalent of VariableManager.expandVariables()

#### Parameters

##### wikiDocument

[`default`](../../../WikiDocument/classes/default.md)

The WikiDocument to process

##### context

[`VariableContext`](../interfaces/VariableContext.md)

Rendering context

#### Returns

`Promise`\<[`default`](../../../WikiDocument/classes/default.md)\>

Updated WikiDocument

***

### resolveVariable()

> __resolveVariable__(`varName`, `context`): `string` \| `number` \| `null`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:233

Resolves a variable name to its value

#### Parameters

##### varName

`string`

Variable name (without {$ })

##### context

[`VariableContext`](../interfaces/VariableContext.md)

Rendering context

#### Returns

`string` \| `number` \| `null`

Variable value or null if not found
