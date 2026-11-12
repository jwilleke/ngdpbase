[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PluginManager](../README.md) / PluginContext

# Interface: PluginContext

Defined in: src/managers/PluginManager.ts:110

Plugin context passed to plugins during execution

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### dependsOn?

> `optional` __dependsOn?__: (`topic`) => `void`

Defined in: src/managers/PluginManager.ts:121

# 1751: this render reads `topic`'s data (by convention the owning
manager's name, e.g. 'LedgerManager'). Call before reading; the cached
page is re-rendered once the manager bumps that topic.

#### Parameters

##### topic

`string`

#### Returns

`void`

***

### engine

> __engine__: [`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

Defined in: src/managers/PluginManager.ts:111

***

### formatters

> __formatters__: [`PluginFormatters`](../type-aliases/PluginFormatters.md)

Defined in: src/managers/PluginManager.ts:115

# 1820: PluginManager's formatter helpers, e.g. `context.formatters.escapeHtml(s)`.

***

### linkGraph

> __linkGraph__: `Record`\<`string`, `unknown`\>

Defined in: src/managers/PluginManager.ts:113

***

### markVolatile?

> `optional` __markVolatile?__: () => `void`

Defined in: src/managers/PluginManager.ts:123

# 1751: this render's output changes on its own; do not cache the page.

#### Returns

`void`

***

### pageName

> __pageName__: `string`

Defined in: src/managers/PluginManager.ts:112
