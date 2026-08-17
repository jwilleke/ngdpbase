[__ngdpbase API v1.5.0__](../../../../../../README.md)

***

[ngdpbase API](../../../../../../README.md) / [src/parsers/dom/handlers/DOMPluginHandler](../README.md) / PluginContext

# Interface: PluginContext

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L23)

Plugin execution context

## Indexable

\[`key`: `string`\]: `unknown`

Additional context properties

## Properties

### bodyContent

> __bodyContent__: `string` \| `null`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:50](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L50)

Plugin body content (for body plugins)

***

### engine

> __engine__: `unknown`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L44)

WikiEngine reference

***

### linkGraph?

> `optional` __linkGraph__: `Record`\<`string`, `unknown`\>

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:58](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L58)

Link graph for plugins like ReferringPagesPlugin

***

### pageContext?

> `optional` __pageContext__: `object`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:60](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L60)

Page context (nested structure)

#### Index Signature

\[`key`: `string`\]: `unknown`

#### pageName?

> `optional` __pageName__: `string`

***

### pageName

> __pageName__: `string`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:25](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L25)

Page name

***

### parameters

> __parameters__: `Record`\<`string`, `string`\>

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:48](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L48)

Plugin parameters

***

### pluginElement?

> `optional` __pluginElement__: `Element` \| `null`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:56](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L56)

Plugin DOM element

***

### pluginName

> __pluginName__: `string`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:52](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L52)

Plugin name

***

### requestInfo?

> `optional` __requestInfo__: `object`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L37)

Request information

#### Index Signature

\[`key`: `string`\]: `unknown`

#### headers?

> `optional` __headers__: `Record`\<`string`, `string`\>

#### method?

> `optional` __method__: `string`

#### path?

> `optional` __path__: `string`

***

### userContext?

> `optional` __userContext__: `object`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:29](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L29)

User context information

#### Index Signature

\[`key`: `string`\]: `unknown`

#### email?

> `optional` __email__: `string`

#### fullName?

> `optional` __fullName__: `string`

#### roles?

> `optional` __roles__: `string`[]

#### username?

> `optional` __username__: `string`

***

### userName

> __userName__: `string`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:27](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L27)

User name

***

### wikiContext?

> `optional` __wikiContext__: `unknown`

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L46)

WikiContext reference

***

### wikiDocument?

> `optional` __wikiDocument__: [`default`](../../../WikiDocument/classes/default.md)

Defined in: [src/parsers/dom/handlers/DOMPluginHandler.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMPluginHandler.ts#L54)

WikiDocument reference
