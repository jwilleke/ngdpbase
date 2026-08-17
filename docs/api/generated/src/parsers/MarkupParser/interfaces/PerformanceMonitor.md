[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/parsers/MarkupParser](../README.md) / PerformanceMonitor

# Interface: PerformanceMonitor

Defined in: [src/parsers/MarkupParser.ts:252](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L252)

Performance monitor state

## Properties

### alerts

> __alerts__: [`PerformanceAlert`](PerformanceAlert.md)[]

Defined in: [src/parsers/MarkupParser.ts:254](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L254)

Performance alerts

***

### checkInterval

> __checkInterval__: `number`

Defined in: [src/parsers/MarkupParser.ts:258](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L258)

Check interval in milliseconds

***

### lastCheck

> __lastCheck__: `number`

Defined in: [src/parsers/MarkupParser.ts:256](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L256)

Last check timestamp

***

### maxRecentEntries

> __maxRecentEntries__: `number`

Defined in: [src/parsers/MarkupParser.ts:264](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L264)

Maximum recent entries to keep

***

### recentErrorRates

> __recentErrorRates__: `number`[]

Defined in: [src/parsers/MarkupParser.ts:262](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L262)

Recent error rates

***

### recentParseTimes

> __recentParseTimes__: [`ParseTimeEntry`](ParseTimeEntry.md)[]

Defined in: [src/parsers/MarkupParser.ts:260](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/parsers/MarkupParser.ts#L260)

Recent parse times
