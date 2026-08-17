[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/Tokenizer](../README.md) / Token

# Interface: Token

Defined in: [src/parsers/dom/Tokenizer.ts:138](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L138)

Token structure

## Extends

- [`PositionInfo`](PositionInfo.md)

## Indexable

\[`key`: `string`\]: `unknown`

Index signature for additional properties

## Properties

### column

> __column__: `number`

Defined in: [src/parsers/dom/Tokenizer.ts:132](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L132)

Column number

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`column`](PositionInfo.md#column)

***

### line

> __line__: `number`

Defined in: [src/parsers/dom/Tokenizer.ts:130](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L130)

Line number

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`line`](PositionInfo.md#line)

***

### metadata?

> `optional` __metadata__: [`TokenMetadata`](TokenMetadata.md)

Defined in: [src/parsers/dom/Tokenizer.ts:144](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L144)

Additional token-specific data

***

### position

> __position__: `number`

Defined in: [src/parsers/dom/Tokenizer.ts:128](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L128)

Character position in input

#### Inherited from

[`PositionInfo`](PositionInfo.md).[`position`](PositionInfo.md#position)

***

### type

> __type__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:140](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L140)

Token type from TokenType enum

***

### value

> __value__: `string`

Defined in: [src/parsers/dom/Tokenizer.ts:142](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/Tokenizer.ts#L142)

Token value/content
