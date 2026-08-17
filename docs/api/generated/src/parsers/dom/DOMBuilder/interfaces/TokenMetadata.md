[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/DOMBuilder](../README.md) / TokenMetadata

# Interface: TokenMetadata

Defined in: [src/parsers/dom/DOMBuilder.ts:63](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L63)

Token metadata interface

## Indexable

\[`key`: `string`\]: `unknown`

Additional metadata properties

## Properties

### level?

> `optional` __level__: `number`

Defined in: [src/parsers/dom/DOMBuilder.ts:65](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L65)

Heading level (for headings)

***

### link?

> `optional` __link__: `string`

Defined in: [src/parsers/dom/DOMBuilder.ts:69](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L69)

Link target (for links)

***

### ordered?

> `optional` __ordered__: `boolean`

Defined in: [src/parsers/dom/DOMBuilder.ts:73](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L73)

Whether list is ordered (for lists)

***

### text?

> `optional` __text__: `string`

Defined in: [src/parsers/dom/DOMBuilder.ts:71](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L71)

Link text (for links)

***

### varName?

> `optional` __varName__: `string`

Defined in: [src/parsers/dom/DOMBuilder.ts:67](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMBuilder.ts#L67)

Variable name (for variables)
