[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/BaseFilter](../README.md) / default

# Abstract Class: default

Defined in: src/parsers/filters/BaseFilter.ts:148

BaseFilter - Abstract base class for all content filters

## Extended by

- [`default`](../../SecurityFilter/classes/default.md)
- [`default`](../../SpamFilter/classes/default.md)
- [`default`](../../ValidationFilter/classes/default.md)

## Constructors

### Constructor

> __new default__(`priority?`, `options?`): `BaseFilter`

Defined in: src/parsers/filters/BaseFilter.ts:167

Create a content filter

#### Parameters

##### priority?

`number` = `100`

Filter priority (0-1000, higher = executed first)

##### options?

[`FilterOptions`](../interfaces/FilterOptions.md) = `{}`

Filter configuration options

#### Returns

`BaseFilter`

## Properties

### category

> `readonly` __category__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:153

***

### config

> `protected` __config__: [`FilterConfig`](../interfaces/FilterConfig.md) \| `null`

Defined in: src/parsers/filters/BaseFilter.ts:160

***

### description

> `readonly` __description__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:152

***

### enabled

> `protected` __enabled__: `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:158

***

### filterId

> `readonly` __filterId__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:150

***

### initialized

> `protected` __initialized__: `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:159

***

### options

> `protected` __options__: `Required`\<[`FilterOptions`](../interfaces/FilterOptions.md)\>

Defined in: src/parsers/filters/BaseFilter.ts:156

***

### phase

> `readonly` __phase__: [`FilterPhase`](../type-aliases/FilterPhase.md)

Defined in: src/parsers/filters/BaseFilter.ts:154

***

### priority

> __priority__: `number`

Defined in: src/parsers/filters/BaseFilter.ts:149

***

### stats

> `protected` __stats__: [`FilterStats`](../interfaces/FilterStats.md)

Defined in: src/parsers/filters/BaseFilter.ts:157

***

### version

> `readonly` __version__: `string`

Defined in: src/parsers/filters/BaseFilter.ts:151

## Methods

### collectErrors()

> `abstract` __collectErrors__(`content`, `context`): `Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

Defined in: src/parsers/filters/BaseFilter.ts:337

Rule violations that must BLOCK a page save — MUST be implemented by
subclasses (#1037).

Abstract on purpose. `FilterChain.collectErrors()` calls this on every
enabled filter, but skipped any filter that did not define it, so a filter
could opt out of save-time enforcement by simply not having the method —
invisibly, with nothing to grep for. SecurityFilter and SpamFilter both
did exactly that, which is why a page containing `<script>` saved cleanly
while a filter that would have caught it was enabled and running.

Declaring it here turns that silence into a compile error. A filter that
genuinely blocks nothing returns `[]` — one explicit line stating a
position, rather than an absence nobody notices.

Note the input: at save time this receives the page SOURCE, not rendered
HTML, regardless of the filter's `phase`. A filter whose `process()` works
on rendered output must not reuse that logic here — assuming otherwise is
what made SecurityFilter's `preventXSS()` entity-encode whole documents.

Only `severity: 'error'` belongs here. Warnings are surfaced at render
time and must never stop a save.

#### Parameters

##### content

`string`

The page source about to be written

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context (pageName, userName, engine)

#### Returns

`Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

Blocking violations; empty when the content is acceptable

***

### createErrorContext()

> `protected` __createErrorContext__(`error`, `content`, `context`): [`FilterErrorContext`](../interfaces/FilterErrorContext.md)

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

[`FilterErrorContext`](../interfaces/FilterErrorContext.md)

Error context

***

### disable()

> __disable__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:414

Disable the filter

#### Returns

`void`

***

### enable()

> __enable__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:407

Enable the filter

#### Returns

`void`

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

***

### getConfigurationSummary()

> __getConfigurationSummary__(): [`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Defined in: src/parsers/filters/BaseFilter.ts:482

Get configuration summary for debugging (modular introspection)

#### Returns

[`ConfigurationSummary`](../interfaces/ConfigurationSummary.md)

Configuration summary

***

### getFilterType()

> `protected` __getFilterType__(): `string` \| `null`

Defined in: src/parsers/filters/BaseFilter.ts:281

Get filter type for configuration lookup (override in subclasses)

#### Returns

`string` \| `null`

Filter type for configuration

***

### getMetadata()

> __getMetadata__(): [`FilterMetadata`](../interfaces/FilterMetadata.md)

Defined in: src/parsers/filters/BaseFilter.ts:464

Get filter metadata

#### Returns

[`FilterMetadata`](../interfaces/FilterMetadata.md)

Filter metadata

***

### getStats()

> __getStats__(): [`FilterStats`](../interfaces/FilterStats.md) & `object`

Defined in: src/parsers/filters/BaseFilter.ts:430

Get filter statistics

#### Returns

[`FilterStats`](../interfaces/FilterStats.md) & `object`

Filter statistics

***

### initialize()

> __initialize__(`context?`): `Promise`\<`void`\>

Defined in: src/parsers/filters/BaseFilter.ts:217

Initialize filter with modular configuration

#### Parameters

##### context?

[`FilterInitializationContext`](../interfaces/FilterInitializationContext.md) = `{}`

Initialization context

#### Returns

`Promise`\<`void`\>

***

### isEnabled()

> __isEnabled__(): `boolean`

Defined in: src/parsers/filters/BaseFilter.ts:422

Check if filter is enabled

#### Returns

`boolean`

True if enabled

***

### loadModularConfiguration()

> `protected` __loadModularConfiguration__(`context`): `void`

Defined in: src/parsers/filters/BaseFilter.ts:235

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

Defined in: src/parsers/filters/BaseFilter.ts:298

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

Defined in: src/parsers/filters/BaseFilter.ts:504

Custom shutdown logic (override in subclasses)

#### Returns

`Promise`\<`void`\>

***

### process()

> `abstract` __process__(`content`, `context`): `Promise`\<`string`\>

Defined in: src/parsers/filters/BaseFilter.ts:308

Main filter processing method - MUST be implemented by subclasses

#### Parameters

##### content

`string`

Content to filter

##### context

[`ParseContext`](../../../context/ParseContext/classes/ParseContext.md)

Parse context

#### Returns

`Promise`\<`string`\>

Filtered content

***

### resetStats()

> __resetStats__(): `void`

Defined in: src/parsers/filters/BaseFilter.ts:450

Reset filter statistics

#### Returns

`void`

***

### shutdown()

> __shutdown__(): `Promise`\<`void`\>

Defined in: src/parsers/filters/BaseFilter.ts:496

Clean up filter resources (optional override)

#### Returns

`Promise`\<`void`\>

***

### toString()

> __toString__(): `string`

Defined in: src/parsers/filters/BaseFilter.ts:512

String representation of filter

#### Returns

`string`

String representation
