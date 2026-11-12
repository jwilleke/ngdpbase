[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / ParserMetrics

# Interface: ParserMetrics

Defined in: src/parsers/MarkupParser.ts:230

Parser metrics

## Extended by

- [`ExtendedMetrics`](ExtendedMetrics.md)

## Properties

### cacheHits

> __cacheHits__: `number`

Defined in: src/parsers/MarkupParser.ts:238

Number of cache hits

***

### cacheMetrics

> __cacheMetrics__: `Map`\<`string`, [`CacheMetrics`](CacheMetrics.md)\>

Defined in: src/parsers/MarkupParser.ts:242

Cache metrics by strategy

***

### cacheMisses

> __cacheMisses__: `number`

Defined in: src/parsers/MarkupParser.ts:240

Number of cache misses

***

### errorCount

> __errorCount__: `number`

Defined in: src/parsers/MarkupParser.ts:236

Number of errors

***

### parseCount

> __parseCount__: `number`

Defined in: src/parsers/MarkupParser.ts:232

Number of parses performed

***

### totalParseTime

> __totalParseTime__: `number`

Defined in: src/parsers/MarkupParser.ts:234

Total parse time in milliseconds
