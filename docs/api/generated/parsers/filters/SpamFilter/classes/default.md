[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/SpamFilter](../README.md) / default

# Class: default

Defined in: src/parsers/filters/SpamFilter.ts:115

SpamFilter - Intelligent spam detection with modular configuration

Provides configurable spam detection based on link count, blacklisted words,
domain whitelisting, and content quality analysis through complete modularity
via app-default-config.json and app-custom-config.json.

Design Principles:

- Configurable spam detection rules
- Whitelist/blacklist modularity
- Zero hardcoded detection rules
- Deployment-specific spam policies

Related Issue: Phase 4 - Security Filter Suite (Spam Detection)
Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support

## Extends

- [`default`](../../BaseFilter/classes/default.md)

## Constructors

### Constructor

> __new default__(): `SpamFilter`

Defined in: src/parsers/filters/SpamFilter.ts:122

#### Returns

`SpamFilter`

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`constructor`](../../BaseFilter/classes/default.md#constructor)

## Properties

### blacklistedWords

> __blacklistedWords__: `Set`\<`string`\>

Defined in: src/parsers/filters/SpamFilter.ts:118

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

Defined in: src/parsers/filters/SpamFilter.ts:116

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

### spamConfig

> __spamConfig__: `SpamConfig` \| `null`

Defined in: src/parsers/filters/SpamFilter.ts:117

***

### spamPatterns

> __spamPatterns__: `RegExp`[]

Defined in: src/parsers/filters/SpamFilter.ts:120

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

***

### whitelistedDomains

> __whitelistedDomains__: `Set`\<`string`\>

Defined in: src/parsers/filters/SpamFilter.ts:119

## Methods

### addBlacklistedWord()

> __addBlacklistedWord__(`word`): `boolean`

Defined in: src/parsers/filters/SpamFilter.ts:485

Add word to blacklist (modular blacklist management)

#### Parameters

##### word

`string`

Word to blacklist

#### Returns

`boolean`

True if added

***

### addWhitelistedDomain()

> __addWhitelistedDomain__(`domain`): `boolean`

Defined in: src/parsers/filters/SpamFilter.ts:515

Add domain to whitelist (modular whitelist management)

#### Parameters

##### domain

`string`

Domain to whitelist

#### Returns

`boolean`

True if added

***

### analyzeSpam()

> __analyzeSpam__(`content`, `_context`): `Promise`\<`SpamAnalysis`\>

Defined in: src/parsers/filters/SpamFilter.ts:298

Analyze content for spam characteristics (modular spam analysis)

#### Parameters

##### content

`string`

Content to analyze

##### \_context

`ParseContext`

Parse context

#### Returns

`Promise`\<`SpamAnalysis`\>

Spam analysis result

***

### collectErrors()

> __collectErrors__(`_content`, `_context?`): `Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

Defined in: src/parsers/filters/SpamFilter.ts:258

Deliberately blocks nothing. See BaseFilter.collectErrors (#1037).

SpamFilter is heuristic — link counts, image counts, a word list. Those
are the right basis for flagging a page and the wrong basis for refusing
to save one: a legitimate reference page can exceed the link threshold,
and an author hitting that has no way to tell a rule from a bug. A false
positive here costs someone their work.

That is a different proposition from SecurityFilter, where every blocked
construct executes script and has no legitimate use in a page, so the
message can be specific and the author knows exactly what to remove.

Spam detection therefore stays at render time, where it annotates rather
than destroys. Turning it into a save-time block is an operator decision
about a public instance, not a default — and it would want thresholds
separate from the render-time ones before it could be recommended.

This returns [] explicitly rather than omitting the method: the method
being absent is exactly how SecurityFilter silently opted out of save-time
enforcement, and how a page containing <script> saved cleanly for so long.

#### Parameters

##### \_content

`string`

##### \_context?

`ParseContext` = `{}`

#### Returns

`Promise`\<[`FilterValidationError`](../../FilterChain/interfaces/FilterValidationError.md)[]\>

#### Overrides

[`default`](../../BaseFilter/classes/default.md).[`collectErrors`](../../BaseFilter/classes/default.md#collecterrors)

***

### countImages()

> __countImages__(`content`): `number`

Defined in: src/parsers/filters/SpamFilter.ts:382

Count images in content (modular image detection)

#### Parameters

##### content

`string`

Content to analyze

#### Returns

`number`

Number of images found

***

### countLinks()

> __countLinks__(`content`): `number`

Defined in: src/parsers/filters/SpamFilter.ts:360

Count links in content (modular link detection)

#### Parameters

##### content

`string`

Content to analyze

#### Returns

`number`

Number of links found

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

### findBlacklistedWords()

> __findBlacklistedWords__(`content`): `string`[]

Defined in: src/parsers/filters/SpamFilter.ts:403

Find blacklisted words in content (modular blacklist checking)

#### Parameters

##### content

`string`

Content to check

#### Returns

`string`[]

Found blacklisted words

***

### findSuspiciousDomains()

> __findSuspiciousDomains__(`content`): `Promise`\<`string`[]\>

Defined in: src/parsers/filters/SpamFilter.ts:421

Find suspicious domains not in whitelist (modular domain checking)

#### Parameters

##### content

`string`

Content to analyze

#### Returns

`Promise`\<`string`[]\>

Suspicious domains found

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

Defined in: src/parsers/filters/SpamFilter.ts:566

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

### getSpamConfiguration()

> __getSpamConfiguration__(): `Record`\<`string`, `unknown`\>

Defined in: src/parsers/filters/SpamFilter.ts:544

Get spam configuration summary (modular introspection)

#### Returns

`Record`\<`string`, `unknown`\>

Spam configuration summary

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

### loadDefaultSpamConfiguration()

> __loadDefaultSpamConfiguration__(): `void`

Defined in: src/parsers/filters/SpamFilter.ts:219

Load default spam configuration when configuration unavailable

#### Returns

`void`

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

### loadModularSpamConfiguration()

> __loadModularSpamConfiguration__(`context`): `void`

Defined in: src/parsers/filters/SpamFilter.ts:160

Load modular spam configuration from app-default/custom-config.json

#### Parameters

##### context

`InitContext`

Initialization context

#### Returns

`void`

***

### logSpamAttempt()

> __logSpamAttempt__(`_content`, `analysis`, `context`): `void`

Defined in: src/parsers/filters/SpamFilter.ts:446

Log spam attempt for monitoring (modular logging)

#### Parameters

##### \_content

`string`

Original content

##### analysis

`SpamAnalysis`

Spam analysis result

##### context

`ParseContext`

Parse context

#### Returns

`void`

***

### onInitialize()

> __onInitialize__(`context`): `Promise`\<`void`\>

Defined in: src/parsers/filters/SpamFilter.ts:144

Initialize filter with modular spam detection configuration

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

Defined in: src/parsers/filters/SpamFilter.ts:265

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

### removeBlacklistedWord()

> __removeBlacklistedWord__(`word`): `boolean`

Defined in: src/parsers/filters/SpamFilter.ts:500

Remove word from blacklist (modular blacklist management)

#### Parameters

##### word

`string`

Word to remove

#### Returns

`boolean`

True if removed

***

### removeWhitelistedDomain()

> __removeWhitelistedDomain__(`domain`): `boolean`

Defined in: src/parsers/filters/SpamFilter.ts:530

Remove domain from whitelist (modular whitelist management)

#### Parameters

##### domain

`string`

Domain to remove

#### Returns

`boolean`

True if removed

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
