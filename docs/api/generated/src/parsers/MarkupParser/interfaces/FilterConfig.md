[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / FilterConfig

# Interface: FilterConfig

Defined in: [src/parsers/MarkupParser.ts:87](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L87)

Filter configuration

## Properties

### enabled

> __enabled__: `boolean`

Defined in: [src/parsers/MarkupParser.ts:89](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L89)

Whether filters are enabled

***

### mode?

> `optional` __mode__: `"sequential"` \| `"parallel"`

Defined in: [src/parsers/MarkupParser.ts:91](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L91)

Filter mode (sequential or parallel)

***

### security

> __security__: [`FilterTypeConfig`](FilterTypeConfig.md)

Defined in: [src/parsers/MarkupParser.ts:93](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L93)

Security filter configuration

***

### spam

> __spam__: [`FilterTypeConfig`](FilterTypeConfig.md)

Defined in: [src/parsers/MarkupParser.ts:95](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L95)

Spam filter configuration

***

### validation

> __validation__: [`FilterTypeConfig`](FilterTypeConfig.md)

Defined in: [src/parsers/MarkupParser.ts:97](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L97)

Validation filter configuration
