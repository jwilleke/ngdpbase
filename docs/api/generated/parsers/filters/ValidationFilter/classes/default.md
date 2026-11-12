[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/ValidationFilter](../README.md) / default

# Class: default

Defined in: src/parsers/filters/ValidationFilter.ts:131

BaseFilter - Abstract base class for all content filters

## Extends

- [`default`](../../BaseFilter/classes/default.md)

## Constructors

### Constructor

> __new default__(): `ValidationFilter`

Defined in: src/parsers/filters/ValidationFilter.ts:137

#### Returns

`ValidationFilter`

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`constructor`](../../BaseFilter/classes/default.md#constructor)

## Properties

### category

> `readonly` __category__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:153

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`category`](../../BaseFilter/classes/default.md#category)

***

### config

> `protected` __config__: [`FilterConfig`](../../BaseFilter/interfaces/FilterConfig.md) \| `null`

Defined in: src/parsers/filters/BaseFilter.ts:160

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`config`](../../BaseFilter/classes/default.md#config)

***

### description

> `readonly` __description__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:152

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`description`](../../BaseFilter/classes/default.md#description)

***

### enabled

> `protected` __enabled__: `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:158

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`enabled`](../../BaseFilter/classes/default.md#enabled)

***

### errorReports

> __errorReports__: `ValidationReport`[]

Defined in: src/parsers/filters/ValidationFilter.ts:135

***

### filterId

> __filterId__: `string`

Defined in: src/parsers/filters/ValidationFilter.ts:132

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`filterId`](../../BaseFilter/classes/default.md#filterid)

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:159

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`initialized`](../../BaseFilter/classes/default.md#initialized)

***

### options

> `protected` __options__: `Required`\<[`FilterOptions`](../../BaseFilter/interfaces/FilterOptions.md)\>

Defined in: src/parsers/filters/BaseFilter.ts:156

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`options`](../../BaseFilter/classes/default.md#options)

***

### phase

> `readonly` __phase__: [`FilterPhase`](../../BaseFilter/type-aliases/FilterPhase.md)

Defined in: src/parsers/filters/BaseFilter.ts:154

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`phase`](../../BaseFilter/classes/default.md#phase)

***

### priority

> __priority__: `number`

Defined in: src/parsers/filters/BaseFilter.ts:149

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`priority`](../../BaseFilter/classes/default.md#priority)

***

### stats

> `protected` __stats__: [`FilterStats`](../../BaseFilter/interfaces/FilterStats.md)

Defined in: src/parsers/filters/BaseFilter.ts:157

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`stats`](../../BaseFilter/classes/default.md#stats)

***

### validationConfig

> __validationConfig__: `ValidationConfig` \| `null`

Defined in: src/parsers/filters/ValidationFilter.ts:133

***

### validationRules

> __validationRules__: `Map`\<`string`, `ValidationRule`\>

Defined in: src/parsers/filters/ValidationFilter.ts:134

***

### version

> `readonly` __version__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:151

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`version`](../../BaseFilter/classes/default.md#version)

## Methods

### addValidationComments()

> __addValidationComments__(`content`, `errors`, `warnings`): `string`

Defined in: src/parsers/filters/ValidationFilter.ts:637

Add validation comments to content (modular error reporting)

#### Parameters

##### content

`string`

Original content

##### errors

`ValidationError`[]

Validation errors

##### warnings

`ValidationError`[]

Validation warnings

#### Returns

`string`

Content with validation comments

***

### addValidationRule()

> __addValidationRule__(`ruleName`, `validator`, `errorMessage`, `severity?`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:690

Add custom validation rule (modular extensibility)

#### Parameters

##### ruleName

`string`

Rule identifier

##### validator

(`content`, `context?`) => `boolean` \| `Promise`\<`boolean`\>

Validation function

##### errorMessage

`string`

Error message

##### severity?

`"error"` \| `"warning"` = `'warning'`

Error severity (error/warning)

#### Returns

`boolean`

True if rule added

***

### clearValidationReports()

> __clearValidationReports__(): `void`

Defined in: src/parsers/filters/ValidationFilter.ts:678

Clear validation error reports

#### Returns

`void`

***

### collectErrors()

> __collectErrors__(`content`, `context?`): `Promise`\<`object`[]\>

Defined in: src/parsers/filters/ValidationFilter.ts:395

Collect error-severity rule violations without mutating content.

Used by FilterChain.collectErrors() during the save-time validation pass
(#596). Only `severity: 'error'` rules are returned — warnings are
surfaced through render-time injection in process() instead.

#### Parameters

##### content

`string`

Content to validate

##### context?

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context (pageName, userName, engine)

#### Returns

`Promise`\<`object`[]\>

Array of error-severity violations, empty if all rules pass

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`collectErrors`](../../BaseFilter/classes/default.md#collecterrors)

***

### createErrorContext()

> `protected` __createErrorContext__(`error`, `content`, `context`): [`FilterErrorContext`](../../BaseFilter/interfaces/FilterErrorContext.md)

Defined in: src/parsers/filters/BaseFilter.ts:388

Create error context for debugging (modular error handling)

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

[`FilterErrorContext`](../../BaseFilter/interfaces/FilterErrorContext.md)

Error context

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`createErrorContext`](../../BaseFilter/classes/default.md#createerrorcontext)

***

### disable()

> __disable__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:414

Disable the filter

#### Returns

`void`

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`disable`](../../BaseFilter/classes/default.md#disable)

***

### enable()

> __enable__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:407

Enable the filter

#### Returns

`void`

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`enable`](../../BaseFilter/classes/default.md#enable)

***

### execute()

> __execute__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/filters/BaseFilter.ts:348

Execute filter with performance tracking and error handling

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

[`default`](../../BaseFilter/classes/default.md).[`execute`](../../BaseFilter/classes/default.md#execute)

***

### getConfigurationSummary()

> __getConfigurationSummary__(): [`ConfigurationSummary`](../../BaseFilter/interfaces/ConfigurationSummary.md)

Defined in: src/parsers/filters/BaseFilter.ts:482

Get configuration summary for debugging (modular introspection)

#### Returns

[`ConfigurationSummary`](../../BaseFilter/interfaces/ConfigurationSummary.md)

Configuration summary

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`getConfigurationSummary`](../../BaseFilter/classes/default.md#getconfigurationsummary)

***

### getFilterType()

> `protected` __getFilterType__(): `string` \| `null`

Defined in: src/parsers/filters/BaseFilter.ts:281

Get filter type for configuration lookup (override in subclasses)

#### Returns

`string` \| `null`

Filter type for configuration

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`getFilterType`](../../BaseFilter/classes/default.md#getfiltertype)

***

### getInfo()

> __getInfo__(): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/filters/ValidationFilter.ts:752

Get filter information for debugging and documentation

#### Returns

`Record`\<`string`, `unknown`\>

Filter information

***

### getMetadata()

> __getMetadata__(): [`FilterMetadata`](../../BaseFilter/interfaces/FilterMetadata.md)

Defined in: src/parsers/filters/BaseFilter.ts:464

Get filter metadata

#### Returns

[`FilterMetadata`](../../BaseFilter/interfaces/FilterMetadata.md)

Filter metadata

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`getMetadata`](../../BaseFilter/classes/default.md#getmetadata)

***

### getStats()

> __getStats__(): [`FilterStats`](../../BaseFilter/interfaces/FilterStats.md) & `object`

Defined in: src/parsers/filters/BaseFilter.ts:430

Get filter statistics

#### Returns

[`FilterStats`](../../BaseFilter/interfaces/FilterStats.md) & `object`

Filter statistics

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`getStats`](../../BaseFilter/classes/default.md#getstats)

***

### getValidationConfiguration()

> __getValidationConfiguration__(): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/filters/ValidationFilter.ts:723

Get validation configuration summary (modular introspection)

#### Returns

`Record`\<`string`, `unknown`\>

Validation configuration summary

***

### getValidationReports()

> __getValidationReports__(`limit?`): `ValidationReport`[]

Defined in: src/parsers/filters/ValidationFilter.ts:671

Get validation error reports (modular error reporting)

#### Parameters

##### limit?

`number` = `50`

Maximum number of reports to return

#### Returns

`ValidationReport`[]

Recent validation error reports

***

### handleValidationResults()

> __handleValidationResults__(`_content`, `errors`, `warnings`, `context`): `Promise`\<`void`\>

Defined in: src/parsers/filters/ValidationFilter.ts:590

Handle validation results based on configuration (modular error handling)

#### Parameters

##### \_content

`string`

Original content

##### errors

`ValidationError`[]

Validation errors

##### warnings

`ValidationError`[]

Validation warnings

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`void`\>

***

### initialize()

> __initialize__(`context?`): `Promise`\<`void`\>

Defined in: src/parsers/filters/BaseFilter.ts:217

Initialize filter with modular configuration

#### Parameters

##### context?

[`FilterInitializationContext`](../../BaseFilter/interfaces/FilterInitializationContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`initialize`](../../BaseFilter/classes/default.md#initialize)

***

### initializeValidationRules()

> __initializeValidationRules__(): `void`

Defined in: src/parsers/filters/ValidationFilter.ts:228

Initialize validation rules based on configuration (modular rule system)

#### Returns

`void`

***

### isEnabled()

> __isEnabled__(): `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:422

Check if filter is enabled

#### Returns

`boolean`

True if enabled

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`isEnabled`](../../BaseFilter/classes/default.md#isenabled)

***

### isTrustedImageDomain()

> __isTrustedImageDomain__(`url`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:566

Check if image domain is trusted (modular domain validation)

#### Parameters

##### url

`string`

Image URL

#### Returns

`boolean`

True if from trusted domain

***

### isValidImageURL()

> __isValidImageURL__(`url`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:546

Validate image URL and format (modular image validation)

#### Parameters

##### url

`string`

Image URL to validate

#### Returns

`boolean`

True if valid image

***

### isValidURL()

> __isValidURL__(`url`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:519

Validate URL format and safety (modular URL validation)

#### Parameters

##### url

`string`

URL to validate

#### Returns

`boolean`

True if valid

***

### loadModularConfiguration()

> `protected` __loadModularConfiguration__(`context`): `void`

Defined in: src/parsers/filters/BaseFilter.ts:235

Load configuration from app-default-config.json and app-custom-config.json

#### Parameters

##### context

[`FilterInitializationContext`](../../BaseFilter/interfaces/FilterInitializationContext.md)

Initialization context

#### Returns

`void`

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`loadModularConfiguration`](../../BaseFilter/classes/default.md#loadmodularconfiguration)

***

### loadModularValidationConfiguration()

> __loadModularValidationConfiguration__(`context`): `void`

Defined in: src/parsers/filters/ValidationFilter.ts:177

Load modular validation configuration from app-default/custom-config.json

#### Parameters

##### context

`InitContext`

Initialization context

#### Returns

`void`

***

### onInitialize()

> __onInitialize__(`context`): `Promise`\<`void`\>

Defined in: src/parsers/filters/ValidationFilter.ts:158

Initialize filter with modular validation configuration

#### Parameters

##### context

`InitContext`

Initialization context

#### Returns

`Promise`\<`void`\>

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`onInitialize`](../../BaseFilter/classes/default.md#oninitialize)

***

### onShutdown()

> `protected` __onShutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/filters/BaseFilter.ts:504

Custom shutdown logic (override in subclasses)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`onShutdown`](../../BaseFilter/classes/default.md#onshutdown)

***

### process()

> __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/filters/ValidationFilter.ts:336

Process content through validation filters (modular validation)

#### Parameters

##### content

`string`

Content to validate

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Validated content (with error comments if configured)

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`process`](../../BaseFilter/classes/default.md#process)

***

### removeValidationRule()

> __removeValidationRule__(`ruleName`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:710

Remove custom validation rule (modular management)

#### Parameters

##### ruleName

`string`

Rule identifier

#### Returns

`boolean`

True if rule removed

***

### resetStats()

> __resetStats__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:450

Reset filter statistics

#### Returns

`void`

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`resetStats`](../../BaseFilter/classes/default.md#resetstats)

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/filters/BaseFilter.ts:496

Clean up filter resources (optional override)

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`shutdown`](../../BaseFilter/classes/default.md#shutdown)

***

### toString()

> __toString__(): `string`

Defined in: src/parsers/filters/BaseFilter.ts:512

String representation of filter

#### Returns

`string`

String representation

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`toString`](../../BaseFilter/classes/default.md#tostring)

***

### validateImages()

> __validateImages__(`content`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:484

Validate images in content (modular image validation)

#### Parameters

##### content

`string`

Content to validate

#### Returns

`boolean`

True if all images are valid

***

### validateLinks()

> __validateLinks__(`content`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:449

Validate links in content (modular link validation)

#### Parameters

##### content

`string`

Content to validate

#### Returns

`boolean`

True if all links are valid

***

### validateMarkupSyntax()

> __validateMarkupSyntax__(`content`): `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:432

Validate markup syntax (modular markup validation)

#### Parameters

##### content

`string`

Content to validate

#### Returns

`boolean`

True if markup is valid
