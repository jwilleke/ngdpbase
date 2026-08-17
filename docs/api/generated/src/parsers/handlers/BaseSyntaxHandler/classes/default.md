[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/handlers/BaseSyntaxHandler](../README.md) / default

# Abstract Class: default

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:165](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L165)

BaseSyntaxHandler - Abstract base class for all markup syntax handlers

## Extended by

- [`default`](../../AttachmentHandler/classes/default.md)
- [`default`](../../EscapedSyntaxHandler/classes/default.md)
- [`default`](../../InterWikiLinkHandler/classes/default.md)
- [`default`](../../JSPWikiPreprocessor/classes/default.md)
- [`default`](../../LinkParserHandler/classes/default.md)
- [`default`](../../PluginSyntaxHandler/classes/default.md)
- [`default`](../../VariableSyntaxHandler/classes/default.md)
- [`default`](../../WikiFormHandler/classes/default.md)
- [`default`](../../WikiLinkHandler/classes/default.md)
- [`default`](../../WikiStyleHandler/classes/default.md)
- [`default`](../../WikiTableHandler/classes/default.md)
- [`default`](../../WikiTagHandler/classes/default.md)

## Constructors

### Constructor

> __new default__(`pattern`, `priority`, `options`): `BaseSyntaxHandler`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:186](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L186)

Create a syntax handler

#### Parameters

##### pattern

Pattern to match (regex or string)

`string` | `RegExp`

##### priority

`number` = `100`

Handler priority (0-1000, higher = executed first)

##### options

[`HandlerOptions`](../interfaces/HandlerOptions.md) = `{}`

Handler configuration options

#### Returns

`BaseSyntaxHandler`

## Properties

### dependencies

> `readonly` __dependencies__: (`string` \| [`DependencySpec`](../interfaces/DependencySpec.md))[]

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:171](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L171)

***

### dependencyErrors?

> `protected` `optional` __dependencyErrors__: [`DependencyError`](../interfaces/DependencyError.md)[]

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:178](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L178)

***

### description

> `readonly` __description__: `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:170](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L170)

***

### enabled

> `protected` __enabled__: `boolean`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:176](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L176)

***

### handlerId

> `readonly` __handlerId__: `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:168](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L168)

***

### initContext?

> `protected` `optional` __initContext__: [`InitializationContext`](../interfaces/InitializationContext.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:177](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L177)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L175)

***

### options

> `protected` __options__: `Required`\<[`HandlerOptions`](../interfaces/HandlerOptions.md)\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:173](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L173)

***

### pattern

> `readonly` __pattern__: `RegExp`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:167](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L167)

***

### priority

> `readonly` __priority__: `number`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L166)

***

### stats

> `protected` __stats__: [`HandlerStats`](../interfaces/HandlerStats.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:174](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L174)

***

### version

> `readonly` __version__: `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L169)

## Methods

### buildRegexFlags()

> `protected` __buildRegexFlags__(): `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:261](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L261)

Build regex flags based on options

#### Returns

`string`

Regex flags string

***

### clone()

> __clone__(`overrides`): [`HandlerCloneConfig`](../interfaces/HandlerCloneConfig.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:712](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L712)

Create a clone of this handler with different options

#### Parameters

##### overrides

`Partial`\<[`HandlerOptions`](../interfaces/HandlerOptions.md)\> & `object` = `{}`

Option overrides

#### Returns

[`HandlerCloneConfig`](../interfaces/HandlerCloneConfig.md)

Handler configuration for creating new instance

***

### compilePattern()

> `protected` __compilePattern__(`pattern`): `RegExp`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:242](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L242)

Compile pattern into RegExp if it's a string

#### Parameters

##### pattern

Pattern to compile

`string` | `RegExp`

#### Returns

`RegExp`

Compiled regular expression

***

### createErrorContext()

> `protected` __createErrorContext__(`error`, `content`, `context`): [`ErrorContext`](../interfaces/ErrorContext.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:480](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L480)

Create error context for debugging

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

[`ErrorContext`](../interfaces/ErrorContext.md)

Error context

***

### createTimeoutPromise()

> `protected` __createTimeoutPromise__(): `Promise`\<`string`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:461](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L461)

Create timeout promise for handler execution

#### Returns

`Promise`\<`string`\>

Promise that rejects after timeout

***

### disable()

> __disable__(): `void`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:630](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L630)

Disable the handler

#### Returns

`void`

***

### enable()

> __enable__(): `void`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:623](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L623)

Enable the handler

#### Returns

`void`

***

### execute()

> __execute__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:414](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L414)

Execute the handler with performance tracking and error handling

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

### getDependencyErrors()

> __getDependencyErrors__(): [`DependencyError`](../interfaces/DependencyError.md)[]

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:378](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L378)

Get dependency validation errors

#### Returns

[`DependencyError`](../interfaces/DependencyError.md)[]

Array of dependency errors

***

### getMetadata()

> __getMetadata__(): [`HandlerMetadata`](../interfaces/HandlerMetadata.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:678](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L678)

Get handler metadata

#### Returns

[`HandlerMetadata`](../interfaces/HandlerMetadata.md)

Handler metadata

***

### getStats()

> __getStats__(): [`HandlerStats`](../interfaces/HandlerStats.md) & `object`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:646](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L646)

Get handler statistics

#### Returns

[`HandlerStats`](../interfaces/HandlerStats.md) & `object`

Handler statistics

***

### handle()

> __handle__(`_match`, `_context`): `Promise`\<`string`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:404](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L404)

Handle a specific match - called for each pattern match

#### Parameters

##### \_match

`RegExpMatchArray`

##### \_context

[`ParseContext`](../interfaces/ParseContext.md)

#### Returns

`Promise`\<`string`\>

Replacement content

***

### hasDependencyErrors()

> __hasDependencyErrors__(): `boolean`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:386](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L386)

Check if handler has unresolved dependencies

#### Returns

`boolean`

True if there are dependency errors

***

### initialize()

> __initialize__(`context`): `Promise`\<`void`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:274](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L274)

Initialize the handler (optional override)
Called when handler is registered

#### Parameters

##### context

[`InitializationContext`](../interfaces/InitializationContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

***

### isEnabled()

> __isEnabled__(): `boolean`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:638](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L638)

Check if handler is enabled

#### Returns

`boolean`

True if enabled

***

### onInitialize()

> `protected` __onInitialize__(`_context`): `Promise`\<`void`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:295](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L295)

Custom initialization logic (override in subclasses)

#### Parameters

##### \_context

[`InitializationContext`](../interfaces/InitializationContext.md)

Initialization context

#### Returns

`Promise`\<`void`\>

***

### onShutdown()

> `protected` __onShutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:703](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L703)

Custom shutdown logic (override in subclasses)

#### Returns

`Promise`\<`void`\>

***

### parseParameters()

> __parseParameters__(`paramString`): `Record`\<`string`, `unknown`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:503](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L503)

Parse parameters from parameter string
Handles various formats: key=value, key='value', key="value"

#### Parameters

##### paramString

Parameter string to parse

`string` | `null` | `undefined`

#### Returns

`Record`\<`string`, `unknown`\>

Parsed parameters

***

### process()

> `abstract` __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:396](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L396)

Main processing method - MUST be implemented by subclasses

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

### resetStats()

> __resetStats__(): `void`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:664](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L664)

Reset handler statistics

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:695](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L695)

Clean up handler resources (optional override)
Called when handler is unregistered

#### Returns

`Promise`\<`void`\>

***

### toString()

> __toString__(): `string`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:730](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L730)

String representation of handler

#### Returns

`string`

String representation

***

### validateDependencies()

> `protected` __validateDependencies__(`context`): `void`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:303](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L303)

Validate handler dependencies

#### Parameters

##### context

[`InitializationContext`](../interfaces/InitializationContext.md)

Initialization context

#### Returns

`void`

***

### validateParameter()

> `protected` __validateParameter__(`key`, `value`, `rule`): [`ParameterValidationResult`](../interfaces/ParameterValidationResult.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:575](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L575)

Validate a single parameter

#### Parameters

##### key

`string`

Parameter key

##### value

`unknown`

Parameter value

##### rule

[`ValidationRule`](../interfaces/ValidationRule.md)

Validation rule

#### Returns

[`ParameterValidationResult`](../interfaces/ParameterValidationResult.md)

Validation result

***

### validateParameters()

> __validateParameters__(`params`, `schema`): [`ValidationResult`](../interfaces/ValidationResult.md)

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:536](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L536)

Validate parameters against schema

#### Parameters

##### params

`Record`\<`string`, `unknown`\>

Parameters to validate

##### schema

`Record`\<`string`, [`ValidationRule`](../interfaces/ValidationRule.md)\> = `{}`

Validation schema

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

Validation result

***

### validateSpecificDependency()

> `protected` __validateSpecificDependency__(`dependency`, `context`): `void`

Defined in: [src/parsers/handlers/BaseSyntaxHandler.ts:340](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/handlers/BaseSyntaxHandler.ts#L340)

Validate specific dependency requirement

#### Parameters

##### dependency

[`DependencySpec`](../interfaces/DependencySpec.md)

Dependency specification

##### context

[`InitializationContext`](../interfaces/InitializationContext.md)

Initialization context

#### Returns

`void`
