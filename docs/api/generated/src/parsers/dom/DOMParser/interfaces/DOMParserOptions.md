[__ngdpbase API v1.5.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [src/parsers/dom/DOMParser](../README.md) / DOMParserOptions

# Interface: DOMParserOptions

Defined in: [src/parsers/dom/DOMParser.ts:68](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L68)

DOMParser options

## Properties

### debug?

> `optional` __debug__: `boolean`

Defined in: [src/parsers/dom/DOMParser.ts:70](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L70)

Enable debug logging

***

### onError?

> `optional` __onError__: (`error`) => `void` \| `null`

Defined in: [src/parsers/dom/DOMParser.ts:74](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L74)

Error callback

***

### onWarning?

> `optional` __onWarning__: (`warning`) => `void` \| `null`

Defined in: [src/parsers/dom/DOMParser.ts:76](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L76)

Warning callback

***

### throwOnError?

> `optional` __throwOnError__: `boolean`

Defined in: [src/parsers/dom/DOMParser.ts:72](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/dom/DOMParser.ts#L72)

Throw on parse errors instead of creating error document
