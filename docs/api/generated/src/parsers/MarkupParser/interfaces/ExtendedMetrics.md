[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / ExtendedMetrics

# Interface: ExtendedMetrics

Defined in: [src/parsers/MarkupParser.ts:290](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L290)

Extended metrics returned by getMetrics()

## Extends

- [`ParserMetrics`](ParserMetrics.md)

## Properties

### averageParseTime

> __averageParseTime__: `number`

Defined in: [src/parsers/MarkupParser.ts:292](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L292)

Average parse time

***

### cacheHitRatio

> __cacheHitRatio__: `number`

Defined in: [src/parsers/MarkupParser.ts:294](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L294)

Cache hit ratio

***

### cacheHits

> __cacheHits__: `number`

Defined in: [src/parsers/MarkupParser.ts:234](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L234)

Number of cache hits

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheHits`](ParserMetrics.md#cachehits)

***

### cacheMetrics

> __cacheMetrics__: `Map`\<`string`, [`CacheMetrics`](CacheMetrics.md)\>

Defined in: [src/parsers/MarkupParser.ts:238](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L238)

Cache metrics by strategy

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheMetrics`](ParserMetrics.md#cachemetrics)

***

### cacheMisses

> __cacheMisses__: `number`

Defined in: [src/parsers/MarkupParser.ts:236](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L236)

Number of cache misses

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`cacheMisses`](ParserMetrics.md#cachemisses)

***

### cacheStrategies?

> `optional` __cacheStrategies__: `Record`\<`string`, `unknown`\>

Defined in: [src/parsers/MarkupParser.ts:300](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L300)

Cache strategies stats

***

### errorCount

> __errorCount__: `number`

Defined in: [src/parsers/MarkupParser.ts:232](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L232)

Number of errors

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`errorCount`](ParserMetrics.md#errorcount)

***

### filterChain?

> `optional` __filterChain__: `unknown`

Defined in: [src/parsers/MarkupParser.ts:298](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L298)

Filter chain stats

***

### handlerRegistry?

> `optional` __handlerRegistry__: `unknown`

Defined in: [src/parsers/MarkupParser.ts:296](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L296)

Handler registry stats

***

### parseCount

> __parseCount__: `number`

Defined in: [src/parsers/MarkupParser.ts:228](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L228)

Number of parses performed

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`parseCount`](ParserMetrics.md#parsecount)

***

### performance?

> `optional` __performance__: `unknown`

Defined in: [src/parsers/MarkupParser.ts:302](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L302)

Performance monitoring stats

***

### totalParseTime

> __totalParseTime__: `number`

Defined in: [src/parsers/MarkupParser.ts:230](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L230)

Total parse time in milliseconds

#### Inherited from

[`ParserMetrics`](ParserMetrics.md).[`totalParseTime`](ParserMetrics.md#totalparsetime)
