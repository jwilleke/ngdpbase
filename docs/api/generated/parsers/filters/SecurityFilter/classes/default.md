[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/SecurityFilter](../README.md) / default

# Class: default

Defined in: src/parsers/filters/SecurityFilter.ts:105

SecurityFilter - Comprehensive security validation with modular configuration

Provides XSS prevention, CSRF protection, HTML sanitization, and dangerous content
detection with complete configurability through app-default-config.json and
app-custom-config.json override system.

Design Principles:

- Security-by-default with configurable relaxation
- Complete modularity through JSON configuration
- Zero hardcoded security rules - everything configurable
- Deployment-specific security levels

Related Issue: Phase 4 - Security Filter Suite
Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support

## Extends

- [`default`](../../BaseFilter/classes/default.md)

## Constructors

### Constructor

> __new default__(): `SecurityFilter`

Defined in: src/parsers/filters/SecurityFilter.ts:113

#### Returns

`SecurityFilter`

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`constructor`](../../BaseFilter/classes/default.md#constructor)

## Properties

### allowedAttributes

> __allowedAttributes__: `Set`\<`string`\>

Defined in: src/parsers/filters/SecurityFilter.ts:109

***

### allowedTags

> __allowedTags__: `Set`\<`string`\>

Defined in: src/parsers/filters/SecurityFilter.ts:108

***

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

### dangerousPatterns

> __dangerousPatterns__: `RegExp`[]

Defined in: src/parsers/filters/SecurityFilter.ts:110

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

### filterId

> __filterId__: `string`

Defined in: src/parsers/filters/SecurityFilter.ts:106

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

### securityConfig

> __securityConfig__: `SecurityConfig` \| `null`

Defined in: src/parsers/filters/SecurityFilter.ts:107

***

### stats

> `protected` __stats__: [`FilterStats`](../../BaseFilter/interfaces/FilterStats.md)

Defined in: src/parsers/filters/BaseFilter.ts:157

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`stats`](../../BaseFilter/classes/default.md#stats)

***

### version

> `readonly` __version__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:151

#### Inherited from

[`default`](../../BaseFilter/classes/default.md).[`version`](../../BaseFilter/classes/default.md#version)

## Methods

### collectErrors()

> __collectErrors__(`content`, `context?`): `Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

Defined in: src/parsers/filters/SecurityFilter.ts:391

Blocking violations for the save path. See BaseFilter.collectErrors.

Reports every offending line rather than stopping at the first, so an
author fixing a page is not sent round the loop once per problem.

#### Parameters

##### content

`string`

##### context?

`ParseContext` = `{}`

#### Returns

`Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

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

### escapeAttributeValue()

> __escapeAttributeValue__(`value`): `string`

Defined in: src/parsers/filters/SecurityFilter.ts:681

Escape attribute values to prevent injection (modular escaping)

#### Parameters

##### value

`string`

Attribute value to escape

#### Returns

`string`

Escaped value

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

Defined in: src/parsers/filters/SecurityFilter.ts:762

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

### getSecurityConfiguration()

> __getSecurityConfiguration__(): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/filters/SecurityFilter.ts:733

Get security configuration summary (modular introspection)

#### Returns

`Record`\<`string`, `unknown`\>

Security configuration summary

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

### initializeDangerousPatterns()

> __initializeDangerousPatterns__(): `void`

Defined in: src/parsers/filters/SecurityFilter.ts:272

Initialize dangerous patterns based on configuration (modular security patterns)

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

### isValidURL()

> __isValidURL__(`url`): `boolean`

Defined in: src/parsers/filters/SecurityFilter.ts:644

Validate URL for href and src attributes (modular URL validation)

#### Parameters

##### url

`string`

URL to validate

#### Returns

`boolean`

True if valid and safe

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

### loadModularSecurityConfiguration()

> __loadModularSecurityConfiguration__(`context`): `void`

Defined in: src/parsers/filters/SecurityFilter.ts:157

Load modular security configuration from configuration hierarchy

#### Parameters

##### context

`InitContext`

Initialization context

#### Returns

`void`

***

### loadSecureDefaults()

> __loadSecureDefaults__(): `void`

Defined in: src/parsers/filters/SecurityFilter.ts:232

Load secure default configuration when configuration files unavailable

#### Returns

`void`

***

### logSecurityViolation()

> __logSecurityViolation__(`originalContent`, `filteredContent`, `context`): `void`

Defined in: src/parsers/filters/SecurityFilter.ts:696

Log security violation for monitoring (modular logging)

#### Parameters

##### originalContent

`string`

Original content

##### filteredContent

`string`

Filtered content

##### context

`ParseContext`

Parse context

#### Returns

`void`

***

### onInitialize()

> __onInitialize__(`context`): `Promise`\<`void`\>

Defined in: src/parsers/filters/SecurityFilter.ts:138

Initialize filter with modular security configuration

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

### preventXSS()

> __preventXSS__(`content`): `string`

Defined in: src/parsers/filters/SecurityFilter.ts:550

Entity-encode every `<` `>` `"` `'`.

NOT used by `process()`, and must not be: this filter runs at the `html`
phase, where the input is rendered markup and encoding it wholesale turns
the page into visible source (#1032). Retained for callers that genuinely
hold untrusted *text* and want it inert.

#### Parameters

##### content

`string`

#### Returns

`string`

***

### process()

> __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/filters/SecurityFilter.ts:443

Main filter processing method - MUST be implemented by subclasses

#### Parameters

##### content

`string`

Content to filter

##### context

`ParseContext`

Parse context

#### Returns

`Promise`\<`string`\>

Filtered content

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`process`](../../BaseFilter/classes/default.md#process)

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

### sanitizeAttributes()

> __sanitizeAttributes__(`attributeString`): `string`

Defined in: src/parsers/filters/SecurityFilter.ts:600

Sanitize HTML attributes based on allowed attributes (modular attribute sanitization)

#### Parameters

##### attributeString

`string`

Attributes to sanitize

#### Returns

`string`

Sanitized attributes

***

### sanitizeHTML()

> __sanitizeHTML__(`content`): `string`

Defined in: src/parsers/filters/SecurityFilter.ts:565

Sanitize HTML based on allowed tags and attributes (modular HTML sanitization)

#### Parameters

##### content

`string`

Content to sanitize

#### Returns

`string`

Sanitized content

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

### stripDangerousContent()

> __stripDangerousContent__(`content`): `string`

Defined in: src/parsers/filters/SecurityFilter.ts:511

Strip dangerous content based on configured patterns (modular security)

#### Parameters

##### content

`string`

Content to clean

#### Returns

`string`

Cleaned content

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
