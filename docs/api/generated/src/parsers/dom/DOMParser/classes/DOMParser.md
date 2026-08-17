[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/DOMParser](../README.md) / DOMParser

# Class: DOMParser

Defined in: [src/parsers/dom/DOMParser.ts:170](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L170)

DOMParser class

## Constructors

### Constructor

> __new DOMParser__(`options`): `DOMParser`

Defined in: [src/parsers/dom/DOMParser.ts:182](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L182)

Creates a new DOMParser

#### Parameters

##### options

[`DOMParserOptions`](../interfaces/DOMParserOptions.md) = `{}`

Parser options

#### Returns

`DOMParser`

## Methods

### checkForWarnings()

> __checkForWarnings__(`tokens`, `result`): `void`

Defined in: [src/parsers/dom/DOMParser.ts:408](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L408)

Checks tokens for common warnings

#### Parameters

##### tokens

[`Token`](../interfaces/Token.md)[]

Tokens to check

##### result

[`ValidationResult`](../interfaces/ValidationResult.md)

Result object to add warnings to

#### Returns

`void`

***

### createErrorDocument()

> __createErrorDocument__(`content`, `context`, `error`): [`default`](../../WikiDocument/classes/default.md)

Defined in: [src/parsers/dom/DOMParser.ts:317](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L317)

Creates an error document when parsing fails

This allows graceful degradation - the page will still render
but show the error to the user.

#### Parameters

##### content

`string`

Original content

##### context

Rendering context

[`RenderContext`](../interfaces/RenderContext.md) | `null`

##### error

`Error`

The error that occurred

#### Returns

[`default`](../../WikiDocument/classes/default.md)

Error document

***

### getStatistics()

> __getStatistics__(): [`ExtendedStatistics`](../interfaces/ExtendedStatistics.md)

Defined in: [src/parsers/dom/DOMParser.ts:434](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L434)

Gets parser statistics

#### Returns

[`ExtendedStatistics`](../interfaces/ExtendedStatistics.md)

Parser statistics

***

### log()

> __log__(`message`): `void`

Defined in: [src/parsers/dom/DOMParser.ts:464](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L464)

Logs debug message if debug mode enabled

#### Parameters

##### message

`string`

Message to log

#### Returns

`void`

***

### parse()

> __parse__(`content`, `context`): [`default`](../../WikiDocument/classes/default.md)

Defined in: [src/parsers/dom/DOMParser.ts:210](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L210)

Parses wiki markup content into a WikiDocument

Main entry point for DOM-based parsing. This is equivalent to
JSPWiki's MarkupParser.parse() method.

#### Parameters

##### content

Wiki markup content to parse

`string` | `null` | `undefined`

##### context

Rendering context (page info, user, etc.)

[`RenderContext`](../interfaces/RenderContext.md) | `null`

#### Returns

[`default`](../../WikiDocument/classes/default.md)

Parsed WikiDocument with DOM tree

#### Throws

ParseError if throwOnError is true and parsing fails

***

### resetStatistics()

> __resetStatistics__(): `void`

Defined in: [src/parsers/dom/DOMParser.ts:449](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L449)

Resets parser statistics

#### Returns

`void`

***

### validate()

> __validate__(`content`): [`ValidationResult`](../interfaces/ValidationResult.md)

Defined in: [src/parsers/dom/DOMParser.ts:372](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L372)

Validates wiki markup without building full DOM

Useful for syntax checking before saving.

#### Parameters

##### content

`string`

Wiki markup to validate

#### Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

Validation result { valid: boolean, errors: [], warnings: [] }
