[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / AuditStats

# Interface: AuditStats

Defined in: src/providers/BaseAuditProvider.ts:81

Audit statistics

## Indexable

> \[`key`: `string`\]: `unknown`

Additional statistics

## Properties

### eventsByResult?

> `optional` __eventsByResult?__: `Record`\<`string`, `number`\>

Defined in: src/providers/BaseAuditProvider.ts:89

Events by result

***

### eventsBySeverity?

> `optional` __eventsBySeverity?__: `Record`\<`string`, `number`\>

Defined in: src/providers/BaseAuditProvider.ts:92

Events by severity

***

### eventsByType?

> `optional` __eventsByType?__: `Record`\<`string`, `number`\>

Defined in: src/providers/BaseAuditProvider.ts:86

Events by type

***

### eventsByUser?

> `optional` __eventsByUser?__: `Record`\<`string`, `number`\>

Defined in: src/providers/BaseAuditProvider.ts:95

Events by user

***

### recentActivity?

> `optional` __recentActivity?__: [`AuditEvent`](../../../types/Provider/interfaces/AuditEvent.md)[]

Defined in: src/providers/BaseAuditProvider.ts:98

Recent activity entries

***

### securityIncidents?

> `optional` __securityIncidents?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:101

Number of security incidents (high/critical severity)

***

### totalEvents

> __totalEvents__: `number`

Defined in: src/providers/BaseAuditProvider.ts:83

Total number of events
