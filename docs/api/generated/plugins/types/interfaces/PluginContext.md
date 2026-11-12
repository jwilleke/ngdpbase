[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / PluginContext

# Interface: PluginContext

Defined in: src/plugins/types.ts:27

Plugin context passed to plugins during execution

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### dependsOn?

> `optional` __dependsOn?__: (`topic`) => `void`

Defined in: src/plugins/types.ts:40

# 1751: this render reads `topic`'s data (by convention the owning
manager's name, e.g. 'LedgerManager'). Call before reading; the cached
page is re-rendered once the manager bumps that topic.

#### Parameters

##### topic

`string`

#### Returns

`void`

***

### engine?

> `optional` __engine?__: [`WikiEngine`](WikiEngine.md)

Defined in: src/plugins/types.ts:28

***

### formatters

> __formatters__: [`PluginFormatters`](../../../managers/PluginManager/type-aliases/PluginFormatters.md)

Defined in: src/plugins/types.ts:34

# 1820: PluginManager's formatter helpers, e.g. `context.formatters.escapeHtml(s)`.

***

### linkGraph

> __linkGraph__: `Record`\<`string`, `unknown`\>

Defined in: src/plugins/types.ts:30

***

### markVolatile?

> `optional` __markVolatile?__: () => `void`

Defined in: src/plugins/types.ts:42

# 1751: this render's output changes on its own; do not cache the page.

#### Returns

`void`

***

### pageName

> __pageName__: `string`

Defined in: src/plugins/types.ts:29

***

### query?

> `optional` __query?__: `Record`\<`string`, `string`\>

Defined in: src/plugins/types.ts:32

Query-string parameters from the current HTTP request (e.g. { page: '2' })
