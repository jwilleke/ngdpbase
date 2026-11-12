[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/Tokenizer](../README.md) / Token

# Interface: Token

Defined in: src/parsers/dom/Tokenizer.ts:140

Token structure

## Extends

- [`PositionInfo`](PositionInfo.md)

## Indexable

> \[`key`: `string`\]: `unknown`

Index signature for additional properties

## Properties

### column

> __column__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:134

Column number

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`column`](PositionInfo.md#column)

***

### line

> __line__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:132

Line number

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`line`](PositionInfo.md#line)

***

### metadata?

> `optional` __metadata?__: [`TokenMetadata`](TokenMetadata.md)

Defined in: src/parsers/dom/Tokenizer.ts:146

Additional token-specific data

***

### position

> __position__: `number`

Defined in: src/parsers/dom/Tokenizer.ts:130

Character position in input

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`position`](PositionInfo.md#position)

***

### type

> __type__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:142

Token type from TokenType enum

***

### value

> __value__: `string`

Defined in: src/parsers/dom/Tokenizer.ts:144

Token value/content
