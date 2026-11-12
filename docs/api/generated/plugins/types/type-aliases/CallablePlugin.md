[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / CallablePlugin

# Type Alias: CallablePlugin

> __CallablePlugin__ = ((`pageName`, `params`, `linkGraph`) => `string` \| `Promise`\<`string`\>) & `object`

Defined in: src/plugins/types.ts:78

Callable plugin type for plugins that can be called directly
(like referringPagesPlugin)

## Type Declaration

### author

> __author__: `string`

### description

> __description__: `string`

### initialize?

> `optional` __initialize?__: (`engine`) => `void`

#### Parameters

##### engine

`unknown`

#### Returns

`void`

### name

> __name__: `string`

### version

> __version__: `string`
