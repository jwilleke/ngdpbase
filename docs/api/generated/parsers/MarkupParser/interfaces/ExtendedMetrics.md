[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / ExtendedMetrics

# Interface: ExtendedMetrics

Defined in: src/parsers/MarkupParser.ts:294

Extended metrics returned by getMetrics()

## Extends

- [`ParserMetrics`](ParserMetrics.md)

## Properties

### averageParseTime

> __averageParseTime__: `number`

Defined in: src/parsers/MarkupParser.ts:296

Average parse time

***

### cacheHitRatio

> __cacheHitRatio__: `number`

Defined in: src/parsers/MarkupParser.ts:298

Cache hit ratio

***

### cacheHits

> __cacheHits__: `number`

Defined in: src/parsers/MarkupParser.ts:238

Number of cache hits

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheHits`](ParserMetrics.md#cachehits)

***

### cacheMetrics

> __cacheMetrics__: `Map`\<`string`, [`CacheMetrics`](CacheMetrics.md)\>

Defined in: src/parsers/MarkupParser.ts:242

Cache metrics by strategy

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheMetrics`](ParserMetrics.md#cachemetrics)

***

### cacheMisses

> __cacheMisses__: `number`

Defined in: src/parsers/MarkupParser.ts:240

Number of cache misses

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheMisses`](ParserMetrics.md#cachemisses)

***

### cacheStrategies?

> `optional` __cacheStrategies?__: `Record`\<`string`, `unknown`\>

Defined in: src/parsers/MarkupParser.ts:304

Cache strategies stats

***

### errorCount

> __errorCount__: `number`

Defined in: src/parsers/MarkupParser.ts:236

Number of errors

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`errorCount`](ParserMetrics.md#errorcount)

***

### filterChain?

> `optional` __filterChain?__: `unknown`

Defined in: src/parsers/MarkupParser.ts:302

Filter chain stats

***

### handlerRegistry?

> `optional` __handlerRegistry?__: `unknown`

Defined in: src/parsers/MarkupParser.ts:300

Handler registry stats

***

### parseCount

> __parseCount__: `number`

Defined in: src/parsers/MarkupParser.ts:232

Number of parses performed

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`parseCount`](ParserMetrics.md#parsecount)

***

### performance?

> `optional` __performance?__: `unknown`

Defined in: src/parsers/MarkupParser.ts:306

Performance monitoring stats

***

### totalParseTime

> __totalParseTime__: `number`

Defined in: src/parsers/MarkupParser.ts:234

Total parse time in milliseconds

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`totalParseTime`](ParserMetrics.md#totalparsetime)
