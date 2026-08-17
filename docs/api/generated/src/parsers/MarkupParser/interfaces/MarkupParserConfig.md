[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / MarkupParserConfig

# Interface: MarkupParserConfig

Defined in: [src/parsers/MarkupParser.ts:31](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L31)

Configuration for MarkupParser

## Extends

- `Record`\<`string`, `unknown`\>

## Indexable

\[`key`: `string`\]: `unknown`

## Properties

### cache

> __cache__: [`CacheConfig`](CacheConfig.md)

Defined in: [src/parsers/MarkupParser.ts:45](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L45)

Cache configuration

***

### cacheTTL

> __cacheTTL__: `number`

Defined in: [src/parsers/MarkupParser.ts:37](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L37)

Cache TTL in seconds

***

### caching

> __caching__: `boolean`

Defined in: [src/parsers/MarkupParser.ts:35](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L35)

Whether caching is enabled

***

### enabled

> __enabled__: `boolean`

Defined in: [src/parsers/MarkupParser.ts:33](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L33)

Whether MarkupParser is enabled

***

### filters

> __filters__: [`FilterConfig`](FilterConfig.md)

Defined in: [src/parsers/MarkupParser.ts:43](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L43)

Filter configuration

***

### handlerRegistry

> __handlerRegistry__: [`HandlerRegistryConfig`](HandlerRegistryConfig.md)

Defined in: [src/parsers/MarkupParser.ts:39](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L39)

Handler registry configuration

***

### handlers

> __handlers__: `Record`\<`string`, [`HandlerConfig`](HandlerConfig.md)\>

Defined in: [src/parsers/MarkupParser.ts:41](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L41)

Handler configurations

***

### performance

> __performance__: [`PerformanceConfig`](PerformanceConfig.md)

Defined in: [src/parsers/MarkupParser.ts:47](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L47)

Performance configuration
