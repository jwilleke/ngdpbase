[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / AuditFilters

# Interface: AuditFilters

Defined in: src/providers/BaseAuditProvider.ts:17

Audit search filters

## Properties

### action?

> `optional` __action?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:43

Filter by action

***

### actor?

> `optional` __actor?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:22

Filter by the person who actually acted, under a proxy grant (#1762)

***

### endDate?

> `optional` __endDate?__: `Date`

Defined in: src/providers/BaseAuditProvider.ts:37

End date filter

***

### eventType?

> `optional` __eventType?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:25

Filter by event type

***

### limit?

> `optional` __limit?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:46

Maximum results to return

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:49

Results offset for pagination

***

### resource?

> `optional` __resource?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:40

Filter by resource

***

### result?

> `optional` __result?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:28

Filter by result (allow, deny, error)

***

### severity?

> `optional` __severity?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:31

Filter by severity level

***

### sortBy?

> `optional` __sortBy?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:52

Sort field

***

### sortOrder?

> `optional` __sortOrder?__: `"asc"` \| `"desc"`

Defined in: src/providers/BaseAuditProvider.ts:55

Sort order (asc/desc)

***

### startDate?

> `optional` __startDate?__: `Date`

Defined in: src/providers/BaseAuditProvider.ts:34

Start date filter

***

### user?

> `optional` __user?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:19

Filter by username — the account acted on
