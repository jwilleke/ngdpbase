[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/Tokenizer](../README.md) / TokenMetadata

# Interface: TokenMetadata

Defined in: [src/parsers/dom/Tokenizer.ts:102](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L102)

Token metadata interface

## Indexable

\[`key`: `string`\]: `unknown`

Additional metadata properties

## Properties

### level?

> `optional` __level__: `number`

Defined in: [src/parsers/dom/Tokenizer.ts:114](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L114)

Heading level (for HEADING tokens)

***

### link?

> `optional` __link__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L110)

Link target (for LINK tokens)

***

### marker?

> `optional` __marker__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:116](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L116)

List marker (* or #) (for LIST_ITEM tokens)

***

### metadataContent?

> `optional` __metadataContent__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:108](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L108)

Metadata content (for METADATA tokens)

***

### ordered?

> `optional` __ordered__: `boolean`

Defined in: [src/parsers/dom/Tokenizer.ts:118](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L118)

Whether list is ordered (for LIST_ITEM tokens)

***

### pluginContent?

> `optional` __pluginContent__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:106](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L106)

Plugin content (for PLUGIN tokens)

***

### text?

> `optional` __text__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:112](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L112)

Link text (for LINK tokens)

***

### varName?

> `optional` __varName__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:104](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L104)

Variable name (for VARIABLE tokens)
