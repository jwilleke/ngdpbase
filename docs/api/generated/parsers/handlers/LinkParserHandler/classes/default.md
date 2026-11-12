[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/handlers/LinkParserHandler](../README.md) / default

# Class: default

Defined in: src/parsers/handlers/LinkParserHandler.ts:66

LinkParserHandler - Unified link processing handler using LinkParser

This handler integrates the comprehensive LinkParser into the MarkupParser
handler architecture, providing centralized processing for all link types:

- Internal wiki links: [PageName], [Display|Target]
- External links: [Display|http://example.com]
- InterWiki links: [Display|Wikipedia:Article]
- Email links: [Display|mailto:user@example.com]
- Anchor links: [Display|#section]
- Links with attributes: [Display|Target|class="custom" target="_blank"]

Replaces the fragmented WikiLinkHandler and InterWikiLinkHandler approach
with a unified, security-focused, and comprehensive solution.

Related Issue: #75 - Create LinkParser.js for centralized link parsing
Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support

## Extends

- [`default`](../../BaseSyntaxHandler/classes/default.md)

## Constructors

### Constructor

> __new default__(`engine?`): `LinkParserHandler`

Defined in: src/parsers/handlers/LinkParserHandler.ts:75

#### Parameters

##### engine?

`WikiEngine` \| `null` = `null`

#### Returns

`LinkParserHandler`

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`constructor`](../../BaseSyntaxHandler/classes/default.md#constructor)

## Properties

### dependencies

> `readonly` __dependencies__: (`string` \| [`DependencySpec`](../../BaseSyntaxHandler/interfaces/DependencySpec.md))[]

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:169

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`dependencies`](../../BaseSyntaxHandler/classes/default.md#dependencies)

***

### dependencyErrors?

> `protected` `optional` __dependencyErrors?__: [`DependencyError`](../../BaseSyntaxHandler/interfaces/DependencyError.md)[]

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:176

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`dependencyErrors`](../../BaseSyntaxHandler/classes/default.md#dependencyerrors)

***

### description

> `readonly` __description__: `string`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:168

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`description`](../../BaseSyntaxHandler/classes/default.md#description)

***

### enabled

> `protected` __enabled__: `boolean`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:174

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`enabled`](../../BaseSyntaxHandler/classes/default.md#enabled)

***

### handlerId

> __handlerId__: `string`

Defined in: src/parsers/handlers/LinkParserHandler.ts:67

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`handlerId`](../../BaseSyntaxHandler/classes/default.md#handlerid)

***

### initContext?

> `protected` `optional` __initContext?__: [`InitializationContext`](../../BaseSyntaxHandler/interfaces/InitializationContext.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:175

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`initContext`](../../BaseSyntaxHandler/classes/default.md#initcontext)

***

### initialized

> __initialized__: `boolean`

Defined in: src/parsers/handlers/LinkParserHandler.ts:70

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`initialized`](../../BaseSyntaxHandler/classes/default.md#initialized)

***

### options

> `protected` __options__: `Required`\<[`HandlerOptions`](../../BaseSyntaxHandler/interfaces/HandlerOptions.md)\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:171

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`options`](../../BaseSyntaxHandler/classes/default.md#options)

***

### pattern

> `readonly` __pattern__: `RegExp`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:165

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`pattern`](../../BaseSyntaxHandler/classes/default.md#pattern)

***

### priority

> __priority__: `number`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:164

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`priority`](../../BaseSyntaxHandler/classes/default.md#priority)

***

### stats

> `protected` __stats__: [`HandlerStats`](../../BaseSyntaxHandler/interfaces/HandlerStats.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:172

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`stats`](../../BaseSyntaxHandler/classes/default.md#stats)

***

### version

> `readonly` __version__: `string`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:167

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`version`](../../BaseSyntaxHandler/classes/default.md#version)

## Methods

### buildRegexFlags()

> `protected` __buildRegexFlags__(): `string`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:258

Build regex flags based on options

#### Returns

`string`

Regex flags string

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`buildRegexFlags`](../../BaseSyntaxHandler/classes/default.md#buildregexflags)

***

### clone()

> __clone__(`overrides?`): [`HandlerCloneConfig`](../../BaseSyntaxHandler/interfaces/HandlerCloneConfig.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:710

Create a clone of this handler with different options

#### Parameters

##### overrides?

`Partial`\<[`HandlerOptions`](../../BaseSyntaxHandler/interfaces/HandlerOptions.md)\> & `object` = `{}`

Option overrides

#### Returns

[`HandlerCloneConfig`](../../BaseSyntaxHandler/interfaces/HandlerCloneConfig.md)

Handler configuration for creating new instance

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`clone`](../../BaseSyntaxHandler/classes/default.md#clone)

***

### compilePattern()

> `protected` __compilePattern__(`pattern`): `RegExp`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:239

Compile pattern into RegExp if it's a string

#### Parameters

##### pattern

`string` \| `RegExp`

Pattern to compile

#### Returns

`RegExp`

Compiled regular expression

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`compilePattern`](../../BaseSyntaxHandler/classes/default.md#compilepattern)

***

### createErrorContext()

> `protected` __createErrorContext__(`error`, `content`, `context`): [`ErrorContext`](../../BaseSyntaxHandler/interfaces/ErrorContext.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:478

Create error context for debugging

#### Parameters

##### error

`Error`

The error that occurred

##### content

`string`

Content being processed

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

[`ErrorContext`](../../BaseSyntaxHandler/interfaces/ErrorContext.md)

Error context

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`createErrorContext`](../../BaseSyntaxHandler/classes/default.md#createerrorcontext)

***

### createTimeoutPromise()

> `protected` __createTimeoutPromise__(): `Promise`\<`string`\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:458

Create timeout promise for handler execution

#### Returns

`Promise`\<`string`\>

Promise that rejects after timeout

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`createTimeoutPromise`](../../BaseSyntaxHandler/classes/default.md#createtimeoutpromise)

***

### disable()

> __disable__(): `void`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:628

Disable the handler

#### Returns

`void`

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`disable`](../../BaseSyntaxHandler/classes/default.md#disable)

***

### enable()

> __enable__(): `void`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:621

Enable the handler

#### Returns

`void`

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`enable`](../../BaseSyntaxHandler/classes/default.md#enable)

***

### execute()

> __execute__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:411

Execute the handler with performance tracking and error handling

#### Parameters

##### content

`string`

Content to process

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Processed content

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`execute`](../../BaseSyntaxHandler/classes/default.md#execute)

***

### getDependencyErrors()

> __getDependencyErrors__(): [`DependencyError`](../../BaseSyntaxHandler/interfaces/DependencyError.md)[]

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:375

Get dependency validation errors

#### Returns

[`DependencyError`](../../BaseSyntaxHandler/interfaces/DependencyError.md)[]

Array of dependency errors

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`getDependencyErrors`](../../BaseSyntaxHandler/classes/default.md#getdependencyerrors)

***

### getInfo()

> __getInfo__(): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:343

Get handler information including LinkParser statistics

#### Returns

`Record`\<`string`, `unknown`\>

Handler information

***

### getMetadata()

> __getMetadata__(): [`HandlerMetadata`](../../BaseSyntaxHandler/interfaces/HandlerMetadata.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:676

Get handler metadata

#### Returns

[`HandlerMetadata`](../../BaseSyntaxHandler/interfaces/HandlerMetadata.md)

Handler metadata

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`getMetadata`](../../BaseSyntaxHandler/classes/default.md#getmetadata)

***

### getStats()

> __getStats__(): [`HandlerStats`](../../BaseSyntaxHandler/interfaces/HandlerStats.md) & `object`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:644

Get handler statistics

#### Returns

[`HandlerStats`](../../BaseSyntaxHandler/interfaces/HandlerStats.md) & `object`

Handler statistics

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`getStats`](../../BaseSyntaxHandler/classes/default.md#getstats)

***

### handle()

> __handle__(`_match`, `_context`): `Promise`\<`string`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:301

Handle method - not used since we override process() entirely

#### Parameters

##### \_match

`RegExpMatchArray`

Match information

##### \_context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Processed match

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`handle`](../../BaseSyntaxHandler/classes/default.md#handle)

***

### hasDependencyErrors()

> __hasDependencyErrors__(): `boolean`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:383

Check if handler has unresolved dependencies

#### Returns

`boolean`

True if there are dependency errors

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`hasDependencyErrors`](../../BaseSyntaxHandler/classes/default.md#hasdependencyerrors)

***

### initialize()

> __initialize__(`context?`): `Promise`\<`void`\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:271

Initialize the handler (optional override)
Called when handler is registered

#### Parameters

##### context?

[`InitializationContext`](../../BaseSyntaxHandler/interfaces/InitializationContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`initialize`](../../BaseSyntaxHandler/classes/default.md#initialize)

***

### isEnabled()

> __isEnabled__(): `boolean`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:636

Check if handler is enabled

#### Returns

`boolean`

True if enabled

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`isEnabled`](../../BaseSyntaxHandler/classes/default.md#isenabled)

***

### onInitialize()

> `protected` __onInitialize__(`context`): `Promise`\<`void`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:104

Initialize handler with LinkParser configuration

#### Parameters

##### context

[`InitializationContext`](../../BaseSyntaxHandler/interfaces/InitializationContext.md)

Initialization context

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`onInitialize`](../../BaseSyntaxHandler/classes/default.md#oninitialize)

***

### onShutdown()

> `protected` __onShutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:376

Handler-specific shutdown cleanup

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`onShutdown`](../../BaseSyntaxHandler/classes/default.md#onshutdown)

***

### parseParameters()

> __parseParameters__(`paramString`): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:501

Parse parameters from parameter string
Handles various formats: key=value, key='value', key="value"

#### Parameters

##### paramString

`string` \| `null` \| `undefined`

Parameter string to parse

#### Returns

`Record`\<`string`, `unknown`\>

Parsed parameters

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`parseParameters`](../../BaseSyntaxHandler/classes/default.md#parseparameters)

***

### process()

> __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:258

Process content using LinkParser

#### Parameters

##### content

`string`

Content to process

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Content with links processed

#### Overrides

[`default`](../../BaseSyntaxHandler/classes/default.md).[`process`](../../BaseSyntaxHandler/classes/default.md#process)

***

### refreshPageNames()

> __refreshPageNames__(): `Promise`\<`void`\>

Defined in: src/parsers/handlers/LinkParserHandler.ts:310

Refresh page names cache (called when pages are added/removed)

#### Returns

`Promise`\<`void`\>

***

### resetStats()

> __resetStats__(): `void`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:662

Reset handler statistics

#### Returns

`void`

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`resetStats`](../../BaseSyntaxHandler/classes/default.md#resetstats)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:693

Clean up handler resources (optional override)
Called when handler is unregistered

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`shutdown`](../../BaseSyntaxHandler/classes/default.md#shutdown)

***

### toString()

> __toString__(): `string`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:728

String representation of handler

#### Returns

`string`

String representation

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`toString`](../../BaseSyntaxHandler/classes/default.md#tostring)

***

### validateDependencies()

> `protected` __validateDependencies__(`context`): `void`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:300

Validate handler dependencies

#### Parameters

##### context

[`InitializationContext`](../../BaseSyntaxHandler/interfaces/InitializationContext.md)

Initialization context

#### Returns

`void`

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`validateDependencies`](../../BaseSyntaxHandler/classes/default.md#validatedependencies)

***

### validateParameter()

> `protected` __validateParameter__(`key`, `value`, `rule`): [`ParameterValidationResult`](../../BaseSyntaxHandler/interfaces/ParameterValidationResult.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:573

Validate a single parameter

#### Parameters

##### key

`string`

Parameter key

##### value

`unknown`

Parameter value

##### rule

[`ValidationRule`](../../BaseSyntaxHandler/interfaces/ValidationRule.md)

Validation rule

#### Returns

[`ParameterValidationResult`](../../BaseSyntaxHandler/interfaces/ParameterValidationResult.md)

Validation result

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`validateParameter`](../../BaseSyntaxHandler/classes/default.md#validateparameter)

***

### validateParameters()

> __validateParameters__(`params`, `schema?`): [`ValidationResult`](../../BaseSyntaxHandler/interfaces/ValidationResult.md)

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:534

Validate parameters against schema

#### Parameters

##### params

`Record`\<`string`, `unknown`\>

Parameters to validate

##### schema?

`Record`\<`string`, [`ValidationRule`](../../BaseSyntaxHandler/interfaces/ValidationRule.md)\> = `{}`

Validation schema

#### Returns

[`ValidationResult`](../../BaseSyntaxHandler/interfaces/ValidationResult.md)

Validation result

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`validateParameters`](../../BaseSyntaxHandler/classes/default.md#validateparameters)

***

### validateSpecificDependency()

> `protected` __validateSpecificDependency__(`dependency`, `context`): `void`

Defined in: src/parsers/handlers/BaseSyntaxHandler.ts:337

Validate specific dependency requirement

#### Parameters

##### dependency

[`DependencySpec`](../../BaseSyntaxHandler/interfaces/DependencySpec.md)

Dependency specification

##### context

[`InitializationContext`](../../BaseSyntaxHandler/interfaces/InitializationContext.md)

Initialization context

#### Returns

`void`

#### Inherited from

[`default`](../../BaseSyntaxHandler/classes/default.md).[`validateSpecificDependency`](../../BaseSyntaxHandler/classes/default.md#validatespecificdependency)
