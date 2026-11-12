[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/MarkupParser](../README.md) / PerformanceMonitor

# Interface: PerformanceMonitor

Defined in: src/parsers/MarkupParser.ts:256

Performance monitor state

## Properties

### alerts

> __alerts__: [`PerformanceAlert`](PerformanceAlert.md)[]

Defined in: src/parsers/MarkupParser.ts:258

Performance alerts

***

### checkInterval

> __checkInterval__: `number`

Defined in: src/parsers/MarkupParser.ts:262

Check interval in milliseconds

***

### lastCheck

> __lastCheck__: `number`

Defined in: src/parsers/MarkupParser.ts:260

Last check timestamp

***

### maxRecentEntries

> __maxRecentEntries__: `number`

Defined in: src/parsers/MarkupParser.ts:268

Maximum recent entries to keep

***

### recentErrorRates

> __recentErrorRates__: `number`[]

Defined in: src/parsers/MarkupParser.ts:266

Recent error rates

***

### recentParseTimes

> __recentParseTimes__: [`ParseTimeEntry`](ParseTimeEntry.md)[]

Defined in: src/parsers/MarkupParser.ts:264

Recent parse times
