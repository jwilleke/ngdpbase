[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/DOMBuilder](../README.md) / Token

# Interface: Token

Defined in: src/parsers/dom/DOMBuilder.ts:81

Token interface

## Indexable

> \[`key`: `string`\]: `unknown`

Additional properties

## Properties

### column?

> `optional` __column?__: `number`

Defined in: src/parsers/dom/DOMBuilder.ts:91

Column number

***

### line?

> `optional` __line?__: `number`

Defined in: src/parsers/dom/DOMBuilder.ts:89

Line number

***

### metadata?

> `optional` __metadata?__: [`TokenMetadata`](TokenMetadata.md)

Defined in: src/parsers/dom/DOMBuilder.ts:87

Token metadata

***

### type

> __type__: `string`

Defined in: src/parsers/dom/DOMBuilder.ts:83

Token type - can be TokenType enum or string for extensibility

***

### value

> __value__: `string`

Defined in: src/parsers/dom/DOMBuilder.ts:85

Token value
