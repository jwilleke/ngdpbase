[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PluginManager](../README.md) / PluginObject

# Interface: PluginObject

Defined in: src/managers/PluginManager.ts:23

Plugin object interface - new-style plugin with execute method

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/managers/PluginManager.ts:26

***

### description?

> `optional` __description?__: `string`

Defined in: src/managers/PluginManager.ts:25

***

### execute

> __execute__: (`context`, `params`) => `string` \| `Promise`\<`string`\>

Defined in: src/managers/PluginManager.ts:30

#### Parameters

##### context

[`PluginContext`](PluginContext.md)

##### params

[`PluginParams`](PluginParams.md)

#### Returns

`string` \| `Promise`\<`string`\>

***

### fetch?

> `optional` __fetch?__: (`engine`) => `void` \| `Promise`\<`void`\>

Defined in: src/managers/PluginManager.ts:29

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### initialize?

> `optional` __initialize?__: (`engine`) => `void` \| `Promise`\<`void`\>

Defined in: src/managers/PluginManager.ts:28

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`void` \| `Promise`\<`void`\>

***

### name?

> `optional` __name?__: `string`

Defined in: src/managers/PluginManager.ts:24

***

### version?

> `optional` __version?__: `string`

Defined in: src/managers/PluginManager.ts:27

***

### volatile?

> `optional` __volatile?__: `boolean`

Defined in: src/managers/PluginManager.ts:37

Its output changes with nothing written (a clock): a page that runs it is
not kept in the page cache (#1751). Data a plugin reads from a manager is
declared with `context.dependsOn(topic)` instead, which keeps the page
cached until that data changes.
