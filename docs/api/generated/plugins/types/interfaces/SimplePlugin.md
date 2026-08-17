[__ngdpbase API v1.5.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / SimplePlugin

# Interface: SimplePlugin

Defined in: [plugins/types.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L41)

Simple plugin interface for plugins that use the execute method pattern
(does not require the callable function signature)

## Properties

### author?

> `optional` __author__: `string`

Defined in: [plugins/types.ts:44](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L44)

***

### description?

> `optional` __description__: `string`

Defined in: [plugins/types.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L43)

***

### execute()?

> `optional` __execute__: (`context`, `params`) => `string` \| `Promise`\<`string`\>

Defined in: [plugins/types.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L47)

#### Parameters

##### context

[`PluginContext`](PluginContext.md)

##### params

[`PluginParams`](PluginParams.md)

#### Returns

`string` \| `Promise`\<`string`\>

***

### initialize()?

> `optional` __initialize__: (`engine`) => `void` \| `Promise`\<`void`\>

Defined in: [plugins/types.ts:46](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L46)

#### Parameters

##### engine

`unknown`

#### Returns

`void` \| `Promise`\<`void`\>

***

### name?

> `optional` __name__: `string`

Defined in: [plugins/types.ts:42](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L42)

***

### version?

> `optional` __version__: `string`

Defined in: [plugins/types.ts:45](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L45)
