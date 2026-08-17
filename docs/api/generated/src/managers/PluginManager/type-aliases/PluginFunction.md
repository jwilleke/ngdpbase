[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/PluginManager](../README.md) / PluginFunction

# Type Alias: PluginFunction()

> __PluginFunction__ = (`pageName`, `params`, `linkGraph`) => `Promise`\<`string`\> \| `string`

Defined in: [src/managers/PluginManager.ts:11](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/PluginManager.ts#L11)

Plugin function type - old-style callable function plugin

## Parameters

### pageName

`string`

### params

[`PluginParams`](../interfaces/PluginParams.md)

### linkGraph

`Record`\<`string`, `unknown`\>

## Returns

`Promise`\<`string`\> \| `string`
