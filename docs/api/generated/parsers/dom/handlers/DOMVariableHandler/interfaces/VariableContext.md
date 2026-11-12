[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [parsers/dom/handlers/DOMVariableHandler](../README.md) / VariableContext

# Interface: VariableContext

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:23

Context for variable resolution

## Indexable

> \[`key`: `string`\]: `unknown`

Additional context properties

## Properties

### engine?

> `optional` __engine?__: `unknown`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:44

WikiEngine reference

***

### pageContext?

> `optional` __pageContext?__: `VariableContext`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:42

Page context (nested structure from WikiContext)

***

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:25

Page name

***

### requestInfo?

> `optional` __requestInfo?__: `object`

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:35

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

Defined in: src/parsers/dom/handlers/DOMVariableHandler.ts:27

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
