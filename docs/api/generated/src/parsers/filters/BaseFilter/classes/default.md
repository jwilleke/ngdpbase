[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/filters/BaseFilter](../README.md) / default

# Abstract Class: default

Defined in: [src/parsers/filters/BaseFilter.ts:135](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L135)

BaseFilter - Abstract base class for all content filters

## Extended by

- [`default`](../../SecurityFilter/classes/default.md)
- [`default`](../../SpamFilter/classes/default.md)
- [`default`](../../ValidationFilter/classes/default.md)

## Constructors

### Constructor

> __new default__(`priority`, `options`): `BaseFilter`

Defined in: [src/parsers/filters/BaseFilter.ts:153](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L153)

Create a content filter

#### Parameters

##### priority

`number` = `100`

Filter priority (0-1000, higher = executed first)

##### options

[`FilterOptions`](../interfaces/FilterOptions.md) = `{}`

Filter configuration options

#### Returns

`BaseFilter`

## Properties

### category

> `readonly` __category__: `string`

Defined in: [src/parsers/filters/BaseFilter.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L140)

***

### config

> `protected` __config__: [`FilterConfig`](../interfaces/FilterConfig.md) \| `null`

Defined in: [src/parsers/filters/BaseFilter.ts:146](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L146)

***

### description

> `readonly` __description__: `string`

Defined in: [src/parsers/filters/BaseFilter.ts:139](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L139)

***

### enabled

> `protected` __enabled__: `boolean`

Defined in: [src/parsers/filters/BaseFilter.ts:144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L144)

***

### filterId

> `readonly` __filterId__: `string`

Defined in: [src/parsers/filters/BaseFilter.ts:137](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L137)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/parsers/filters/BaseFilter.ts:145](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L145)

***

### options

> `protected` __options__: `Required`\<[`FilterOptions`](../interfaces/FilterOptions.md)\>

Defined in: [src/parsers/filters/BaseFilter.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L142)

***

### priority

> __priority__: `number`

Defined in: [src/parsers/filters/BaseFilter.ts:136](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L136)

***

### stats

> `protected` __stats__: [`FilterStats`](../interfaces/FilterStats.md)

Defined in: [src/parsers/filters/BaseFilter.ts:143](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L143)

***

### version

> `readonly` __version__: `string`

Defined in: [src/parsers/filters/BaseFilter.ts:138](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L138)

## Methods

### createErrorContext()

> `protected` __createErrorContext__(`error`, `content`, `context`): [`FilterErrorContext`](../interfaces/FilterErrorContext.md)

Defined in: [src/parsers/filters/BaseFilter.ts:340](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L340)

Create error context for debugging (modular error handling)

#### Parameters

##### error

`Error`

The error that occurred

##### content

`string`

Content being processed

##### context

[`ParseContext`](../interfaces/ParseContext.md)

Parse context

#### Returns

[`FilterErrorContext`](../interfaces/FilterErrorContext.md)

Error context

***

### disable()

> __disable__(): `void`

Defined in: [src/parsers/filters/BaseFilter.ts:366](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L366)

Disable the filter

#### Returns

`void`

***

### enable()

> __enable__(): `void`

Defined in: [src/parsers/filters/BaseFilter.ts:359](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L359)

Enable the filter

#### Returns

`void`

***

### execute()

> __execute__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/filters/BaseFilter.ts:300](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L300)

Execute filter with performance tracking and error handling

#### Parameters

##### content

`string`

Content to process

##### context

[`ParseContext`](../interfaces/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Processed content

***

### getConfigurationSummary()

> __getConfigurationSummary__(): [`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Defined in: [src/parsers/filters/BaseFilter.ts:434](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L434)

Get configuration summary for debugging (modular introspection)

#### Returns

[`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Configuration summary

***

### getFilterType()

> `protected` __getFilterType__(): `string` \| `null`

Defined in: [src/parsers/filters/BaseFilter.ts:265](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L265)

Get filter type for configuration lookup (override in subclasses)

#### Returns

`string` \| `null`

Filter type for configuration

***

### getMetadata()

> __getMetadata__(): [`FilterMetadata`](../interfaces/FilterMetadata.md)

Defined in: [src/parsers/filters/BaseFilter.ts:416](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L416)

Get filter metadata

#### Returns

[`FilterMetadata`](../interfaces/FilterMetadata.md)

Filter metadata

***

### getStats()

> __getStats__(): [`FilterStats`](../interfaces/FilterStats.md) & `object`

Defined in: [src/parsers/filters/BaseFilter.ts:382](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L382)

Get filter statistics

#### Returns

[`FilterStats`](../interfaces/FilterStats.md) & `object`

Filter statistics

***

### initialize()

> __initialize__(`context`): `Promise`\<`void`\>

Defined in: [src/parsers/filters/BaseFilter.ts:201](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L201)

Initialize filter with modular configuration

#### Parameters

##### context

[`FilterInitializationContext`](../interfaces/FilterInitializationContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

***

### isEnabled()

> __isEnabled__(): `boolean`

Defined in: [src/parsers/filters/BaseFilter.ts:374](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L374)

Check if filter is enabled

#### Returns

`boolean`

True if enabled

***

### loadModularConfiguration()

> `protected` __loadModularConfiguration__(`context`): `void`

Defined in: [src/parsers/filters/BaseFilter.ts:219](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L219)

Load configuration from app-default-config.json and app-custom-config.json

#### Parameters

##### context

[`FilterInitializationContext`](../interfaces/FilterInitializationContext.md)

Initialization context

#### Returns

`void`

***

### onInitialize()

> `protected` __onInitialize__(`_context`): `Promise`\<`void`\>

Defined in: [src/parsers/filters/BaseFilter.ts:282](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L282)

Custom initialization logic (override in subclasses)

#### Parameters

##### \_context

[`FilterInitializationContext`](../interfaces/FilterInitializationContext.md)

Initialization context

#### Returns

`Promise`\<`void`\>

***

### onShutdown()

> `protected` __onShutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/filters/BaseFilter.ts:456](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L456)

Custom shutdown logic (override in subclasses)

#### Returns

`Promise`\<`void`\>

***

### process()

> `abstract` __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/filters/BaseFilter.ts:292](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L292)

Main filter processing method - MUST be implemented by subclasses

#### Parameters

##### content

`string`

Content to filter

##### context

[`ParseContext`](../interfaces/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Filtered content

***

### resetStats()

> __resetStats__(): `void`

Defined in: [src/parsers/filters/BaseFilter.ts:402](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L402)

Reset filter statistics

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/filters/BaseFilter.ts:448](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L448)

Clean up filter resources (optional override)

#### Returns

`Promise`\<`void`\>

***

### toString()

> __toString__(): `string`

Defined in: [src/parsers/filters/BaseFilter.ts:464](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/filters/BaseFilter.ts#L464)

String representation of filter

#### Returns

`string`

String representation
