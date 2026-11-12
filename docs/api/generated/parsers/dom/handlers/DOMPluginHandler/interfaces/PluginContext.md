[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [parsers/dom/handlers/DOMPluginHandler](../README.md) / PluginContext

# Interface: PluginContext

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:23

Plugin execution context

## Indexable

> \[`key`: `string`\]: `unknown`

Additional context properties

## Properties

### bodyContent

> __bodyContent__: `string` \| `null`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:52

Plugin body content (for body plugins)

***

### engine

> __engine__: `unknown`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:46

WikiEngine reference

***

### linkGraph?

> `optional` __linkGraph?__: `Record`\<`string`, `unknown`\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:60

Link graph for plugins like ReferringPagesPlugin

***

### pageContext?

> `optional` __pageContext?__: `object`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:62

Page context (nested structure)

#### Index Signature

\[`key`: `string`\]: `unknown`

#### pageName?

> `optional` __pageName?__: `string`

***

### pageMetadata?

> `optional` __pageMetadata?__: `unknown`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:44

Page front matter metadata (uuid, title, etc.)

***

### pageName

> __pageName__: `string`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:25

Page name

***

### parameters

> __parameters__: `Record`\<`string`, `string`\>

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:50

Plugin parameters

***

### pluginElement?

> `optional` __pluginElement?__: [`LinkedomElement`](../../../../../types/linkedom/interfaces/LinkedomElement.md) \| `null`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:58

Plugin DOM element

***

### pluginName

> __pluginName__: `string`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:54

Plugin name

***

### requestInfo?

> `optional` __requestInfo?__: `object`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:37

Request information

#### Index Signature

\[`key`: `string`\]: `unknown`

#### headers?

> `optional` __headers?__: `Record`\<`string`, `string`\>

#### method?

> `optional` __method?__: `string`

#### path?

> `optional` __path?__: `string`

***

### userContext?

> `optional` __userContext?__: `object`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:29

User context information

#### Index Signature

\[`key`: `string`\]: `unknown`

#### email?

> `optional` __email?__: `string`

#### fullName?

> `optional` __fullName?__: `string`

#### roles?

> `optional` __roles?__: `string`[]

#### username?

> `optional` __username?__: `string`

***

### userName

> __userName__: `string`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:27

User name

***

### wikiContext?

> `optional` __wikiContext?__: `unknown`

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:48

WikiContext reference

***

### wikiDocument?

> `optional` __wikiDocument?__: [`default`](../../../WikiDocument/classes/default.md)

Defined in: src/parsers/dom/handlers/DOMPluginHandler.ts:56

WikiDocument reference
