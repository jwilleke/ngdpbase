[__ngdpbase API v1.5.0__](../../../../../../README.md)

***

[ngdpbase API](../../../../../../README.md) / [src/parsers/dom/handlers/DOMVariableHandler](../README.md) / VariableContext

# Interface: VariableContext

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:23](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L23)

Context for variable resolution

## Indexable

\[`key`: `string`\]: `unknown`

Additional context properties

## Properties

### engine?

> `optional` __engine__: `unknown`

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L44)

WikiEngine reference

***

### pageContext?

> `optional` __pageContext__: `VariableContext`

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L42)

Page context (nested structure from WikiContext)

***

### pageName?

> `optional` __pageName__: `string`

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:25](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L25)

Page name

***

### requestInfo?

> `optional` __requestInfo__: `object`

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L35)

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

Defined in: [src/parsers/dom/handlers/DOMVariableHandler.ts:27](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/handlers/DOMVariableHandler.ts#L27)

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
