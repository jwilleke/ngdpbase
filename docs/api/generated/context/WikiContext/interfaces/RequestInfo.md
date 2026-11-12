[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/WikiContext](../README.md) / RequestInfo

# Interface: RequestInfo

Defined in: src/context/WikiContext.ts:34

Request information extracted from Express request

## Properties

### acceptLanguage?

> `optional` __acceptLanguage?__: `string`

Defined in: src/context/WikiContext.ts:36

Accept-Language header

***

### clientIp?

> `optional` __clientIp?__: `string`

Defined in: src/context/WikiContext.ts:40

Client IP address

***

### query?

> `optional` __query?__: `Record`\<`string`, `string`\>

Defined in: src/context/WikiContext.ts:46

Parsed query-string parameters (e.g. `?page=2&sort=count-desc`)

***

### referer?

> `optional` __referer?__: `string`

Defined in: src/context/WikiContext.ts:42

Referer header

***

### sessionId?

> `optional` __sessionId?__: `string`

Defined in: src/context/WikiContext.ts:44

Session ID

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/context/WikiContext.ts:38

User-Agent header
