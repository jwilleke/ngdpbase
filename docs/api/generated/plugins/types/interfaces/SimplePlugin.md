[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / SimplePlugin

# Interface: SimplePlugin

Defined in: src/plugins/types.ts:57

Simple plugin interface for plugins that use the execute method pattern
(does not require the callable function signature)

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/plugins/types.ts:60

***

### description?

> `optional` __description?__: `string`

Defined in: src/plugins/types.ts:59

***

### execute?

> `optional` __execute?__: (`context`, `params`) => `string` \| `Promise`\<`string`\>

Defined in: src/plugins/types.ts:64

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

Defined in: src/plugins/types.ts:63

#### Parameters

##### engine

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### initialize?

> `optional` __initialize?__: (`engine`) => `void` \| `Promise`\<`void`\>

Defined in: src/plugins/types.ts:62

#### Parameters

##### engine

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### name?

> `optional` __name?__: `string`

Defined in: src/plugins/types.ts:58

***

### version?

> `optional` __version?__: `string`

Defined in: src/plugins/types.ts:61

***

### volatile?

> `optional` __volatile?__: `boolean`

Defined in: src/plugins/types.ts:71

Its output changes with nothing written (a clock): a page that runs it is
not kept in the page cache (#1751). Data a plugin reads from a manager is
declared with `context.dependsOn(topic)` instead, which keeps the page
cached until that data changes.
