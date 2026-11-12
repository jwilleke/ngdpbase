[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / StoredAuditRecord

# Interface: StoredAuditRecord

Defined in: src/providers/BaseAuditProvider.ts:137

The shape every storing provider writes (#1119, #1537): one shape, so a
record reads, exports and verifies the same whichever provider wrote it.

## Properties

### action?

> `optional` __action?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:151

***

### actor?

> `optional` __actor?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:144

Who actually did it when that is not `user` — under a proxy grant (#1762).

***

### context?

> `optional` __context?__: `Record`\<`string`, `unknown`\>

Defined in: src/providers/BaseAuditProvider.ts:156

***

### duration?

> `optional` __duration?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:158

***

### eventType

> __eventType__: `string`

Defined in: src/providers/BaseAuditProvider.ts:141

***

### id

> __id__: `string`

Defined in: src/providers/BaseAuditProvider.ts:138

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:147

***

### level?

> `optional` __level?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:140

***

### metadata?

> `optional` __metadata?__: `Record`\<`string`, `unknown`\>

Defined in: src/providers/BaseAuditProvider.ts:157

***

### policyId?

> `optional` __policyId?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:154

***

### policyName?

> `optional` __policyName?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:155

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:153

***

### resource?

> `optional` __resource?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:149

***

### resourceType?

> `optional` __resourceType?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:150

***

### result?

> `optional` __result?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:152

***

### sessionId?

> `optional` __sessionId?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:146

***

### severity?

> `optional` __severity?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:159

***

### timestamp

> __timestamp__: `string`

Defined in: src/providers/BaseAuditProvider.ts:139

***

### user?

> `optional` __user?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:142

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:148

***

### userId?

> `optional` __userId?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:145
