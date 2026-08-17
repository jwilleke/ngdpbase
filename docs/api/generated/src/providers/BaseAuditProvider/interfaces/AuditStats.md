[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/providers/BaseAuditProvider](../README.md) / AuditStats

# Interface: AuditStats

Defined in: [src/providers/BaseAuditProvider.ts:78](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L78)

Audit statistics

## Indexable

\[`key`: `string`\]: `unknown`

Additional statistics

## Properties

### eventsByResult?

> `optional` __eventsByResult__: `Record`\<`string`, `number`\>

Defined in: [src/providers/BaseAuditProvider.ts:86](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L86)

Events by result

***

### eventsBySeverity?

> `optional` __eventsBySeverity__: `Record`\<`string`, `number`\>

Defined in: [src/providers/BaseAuditProvider.ts:89](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L89)

Events by severity

***

### eventsByType?

> `optional` __eventsByType__: `Record`\<`string`, `number`\>

Defined in: [src/providers/BaseAuditProvider.ts:83](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L83)

Events by type

***

### eventsByUser?

> `optional` __eventsByUser__: `Record`\<`string`, `number`\>

Defined in: [src/providers/BaseAuditProvider.ts:92](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L92)

Events by user

***

### recentActivity?

> `optional` __recentActivity__: `any`[]

Defined in: [src/providers/BaseAuditProvider.ts:96](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L96)

Recent activity entries

***

### securityIncidents?

> `optional` __securityIncidents__: `number`

Defined in: [src/providers/BaseAuditProvider.ts:99](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L99)

Number of security incidents (high/critical severity)

***

### totalEvents

> __totalEvents__: `number`

Defined in: [src/providers/BaseAuditProvider.ts:80](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/providers/BaseAuditProvider.ts#L80)

Total number of events
