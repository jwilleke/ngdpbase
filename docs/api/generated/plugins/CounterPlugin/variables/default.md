[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [plugins/CounterPlugin](../README.md) / default

# Variable: default

> `const` __default__: `object`

Defined in: src/plugins/CounterPlugin.ts:94

## Type Declaration

### author

> __author__: `string` = `'ngdpbase'`

### description

> __description__: `string` = `'Maintains page-specific counters for numbering and tracking'`

### execute()

> __execute__(`context`, `params`): `string`

Execute the plugin

#### Parameters

##### context

[`PluginContext`](../../types/interfaces/PluginContext.md)

Wiki context containing counter state

##### params

[`PluginParams`](../../types/interfaces/PluginParams.md)

Plugin parameters

#### Returns

`string`

Counter value or empty string

### initialize()

> __initialize__(`engine`): `void`

Plugin initialization (JSPWiki-style)
Registers counter variables with VariableManager for [{$counter}] access

#### Parameters

##### engine

`unknown`

Wiki engine instance

#### Returns

`void`

### name

> __name__: `string` = `'CounterPlugin'`

### parseBoolean

> __parseBoolean__: (`value`, `defaultValue`) => `boolean`

Parse a parameter value as a boolean

#### Parameters

##### value

`unknown`

Value to parse

##### defaultValue

`boolean`

Default if parsing fails

#### Returns

`boolean`

Parsed boolean

### parseNumber

> __parseNumber__: (`value`, `defaultValue`) => `number`

Parse a parameter value as a number

#### Parameters

##### value

`unknown`

Value to parse

##### defaultValue

`number`

Default if parsing fails

#### Returns

`number`

Parsed number

### version

> __version__: `string` = `'1.0.0'`

### volatile

> __volatile__: `boolean` = `true`
