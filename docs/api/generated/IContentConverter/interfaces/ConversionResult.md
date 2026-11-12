[__ngdpbase API v5.43.0__](../../README.md)

***

[ngdpbase API](../../README.md) / [IContentConverter](../README.md) / ConversionResult

# Interface: ConversionResult

Defined in: src/converters/IContentConverter.ts:42

Result of a content conversion operation

## Properties

### content

> __content__: `string`

Defined in: src/converters/IContentConverter.ts:44

The converted Markdown content

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/converters/IContentConverter.ts:47

Extracted metadata (e.g., from JSPWiki [{SET name=value}] attributes)

***

### warnings

> __warnings__: [`ConversionWarning`](ConversionWarning.md)[]

Defined in: src/converters/IContentConverter.ts:50

Structured warnings generated during conversion (non-fatal issues).
