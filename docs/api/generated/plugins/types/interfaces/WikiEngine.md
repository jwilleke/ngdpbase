[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/types](../README.md) / WikiEngine

# Interface: WikiEngine

Defined in: src/plugins/types.ts:15

Wiki engine interface for plugins

## Properties

### logger?

> `optional` __logger?__: `object`

Defined in: src/plugins/types.ts:18

#### error

> __error__: (...`args`) => `void`

##### Parameters

###### args

...`unknown`[]

##### Returns

`void`

***

### startTime?

> `optional` __startTime?__: `number`

Defined in: src/plugins/types.ts:17

## Methods

### getConfig()?

> `optional` __getConfig__(): `object`

Defined in: src/plugins/types.ts:21

#### Returns

`object`

##### get?

> `optional` __get?__: (`key`, `defaultValue`) => `unknown`

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

Defined in: src/plugins/types.ts:16

#### Parameters

##### name

`string`

#### Returns

`unknown`
