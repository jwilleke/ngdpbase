[__ngdpbase API v1.5.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / WikiEngine

# Interface: WikiEngine

Defined in: [plugins/types.ts:11](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L11)

Wiki engine interface for plugins

## Properties

### logger?

> `optional` __logger__: `object`

Defined in: [plugins/types.ts:14](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L14)

#### error()

> __error__: (...`args`) => `void`

##### Parameters

###### args

...`unknown`[]

##### Returns

`void`

***

### startTime?

> `optional` __startTime__: `number`

Defined in: [plugins/types.ts:13](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L13)

## Methods

### getConfig()?

> `optional` __getConfig__(): `object`

Defined in: [plugins/types.ts:17](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L17)

#### Returns

`object`

##### get()?

> `optional` __get__: (`key`, `defaultValue`) => `unknown`

###### Parameters

###### key

`string`

###### defaultValue

`unknown`

###### Returns

`unknown`

***

### getManager()

> __getManager__(`name`): `unknown`

Defined in: [plugins/types.ts:12](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/plugins/types.ts#L12)

#### Parameters

##### name

`string`

#### Returns

`unknown`
