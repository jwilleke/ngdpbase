[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / MarkupParserConfig

# Interface: MarkupParserConfig

Defined in: src/parsers/MarkupParser.ts:49

Configuration for MarkupParser

## Extends

- `Record`\<`string`, `unknown`\>

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### cache

> __cache__: [`CacheConfig`](CacheConfig.md)

Defined in: src/parsers/MarkupParser.ts:61

Cache configuration

***

### cacheTTL

> __cacheTTL__: `number`

Defined in: src/parsers/MarkupParser.ts:55

Cache TTL in seconds

***

### caching

> __caching__: `boolean`

Defined in: src/parsers/MarkupParser.ts:53

Whether caching is enabled

***

### emoji?

> `optional` __emoji?__: `object`

Defined in: src/parsers/MarkupParser.ts:65

Emoji shortcode conversion

#### enabled

> __enabled__: `boolean`

***

### enabled

> __enabled__: `boolean`

Defined in: src/parsers/MarkupParser.ts:51

Whether MarkupParser is enabled

***

### handlerRegistry

> __handlerRegistry__: [`HandlerRegistryConfig`](HandlerRegistryConfig.md)

Defined in: src/parsers/MarkupParser.ts:57

Handler registry configuration

***

### handlers

> __handlers__: `Record`\<`string`, [`HandlerConfig`](HandlerConfig.md)\>

Defined in: src/parsers/MarkupParser.ts:59

Handler configurations

***

### performance

> __performance__: [`PerformanceConfig`](PerformanceConfig.md)

Defined in: src/parsers/MarkupParser.ts:63

Performance configuration
