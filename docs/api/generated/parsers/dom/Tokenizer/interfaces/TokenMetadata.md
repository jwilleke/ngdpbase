[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/Tokenizer](../README.md) / TokenMetadata

# Interface: TokenMetadata

Defined in: src/parsers/dom/Tokenizer.ts:102

Token metadata interface

## Indexable

> \[`key`: `string`\]: `unknown`

Additional metadata properties

## Properties

### attrs?

> `optional` __attrs?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:114

Raw attribute string after the second pipe (for LINK tokens), e.g. `class='btn'`

***

### level?

> `optional` __level?__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:116

Heading level (for HEADING tokens)

***

### link?

> `optional` __link?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:110

Link target (for LINK tokens)

***

### marker?

> `optional` __marker?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:118

List marker (* or #) (for LIST_ITEM tokens)

***

### metadataContent?

> `optional` __metadataContent?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:108

Metadata content (for METADATA tokens)

***

### ordered?

> `optional` __ordered?__: `boolean`

Defined in: src/parsers/dom/Tokenizer.ts:120

Whether list is ordered (for LIST_ITEM tokens)

***

### pluginContent?

> `optional` __pluginContent?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:106

Plugin content (for PLUGIN tokens)

***

### text?

> `optional` __text?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:112

Link text (for LINK tokens)

***

### varName?

> `optional` __varName?__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:104

Variable name (for VARIABLE tokens)
