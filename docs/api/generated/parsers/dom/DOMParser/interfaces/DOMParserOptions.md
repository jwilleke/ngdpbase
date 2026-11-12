[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/dom/DOMParser](../README.md) / DOMParserOptions

# Interface: DOMParserOptions

Defined in: src/parsers/dom/DOMParser.ts:68

DOMParser options

## Properties

### debug?

> `optional` __debug?__: `boolean`

Defined in: src/parsers/dom/DOMParser.ts:70

Enable debug logging

***

### onError?

> `optional` __onError?__: ((`error`) => `void`) \| `null`

Defined in: src/parsers/dom/DOMParser.ts:74

Error callback

***

### onWarning?

> `optional` __onWarning?__: ((`warning`) => `void`) \| `null`

Defined in: src/parsers/dom/DOMParser.ts:76

Warning callback

***

### throwOnError?

> `optional` __throwOnError?__: `boolean`

Defined in: src/parsers/dom/DOMParser.ts:72

Throw on parse errors instead of creating error document
