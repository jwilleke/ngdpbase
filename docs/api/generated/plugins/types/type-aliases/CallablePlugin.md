[__ngdpbase API v1.5.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / CallablePlugin

# Type Alias: CallablePlugin

> __CallablePlugin__ = (`pageName`, `params`, `linkGraph`) => `string` \| `Promise`\<`string`\> & `object`

Defined in: [plugins/types.ts:54](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L54)

Callable plugin type for plugins that can be called directly
(like referringPagesPlugin)

## Type Declaration

### author

> __author__: `string`

### description

> __description__: `string`

### initialize()?

> `optional` __initialize__: (`engine`) => `void`

#### Parameters

##### engine

`unknown`

#### Returns

`void`

### name

> __name__: `string`

### version

> __version__: `string`
