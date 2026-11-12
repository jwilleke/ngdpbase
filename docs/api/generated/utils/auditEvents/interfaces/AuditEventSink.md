[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AuditEventSink

# Interface: AuditEventSink

Defined in: src/utils/auditEvents.ts:39

The subset of `AuditManager` these helpers need.

## Properties

### flushAuditQueue?

> `optional` __flushAuditQueue?__: () => `Promise`\<`void`\>

Defined in: src/utils/auditEvents.ts:53

Force queued records to storage (#1121).

Named for the method AuditManager actually has. An earlier draft called it
`flush`, which nothing implements — so every critical event would have
refused in production while the tests passed. Third time this exact
mismatch has bitten in this issue chain.

Optional because not every sink batches, but a sink WITHOUT it cannot
promise durability, so a critical event refuses rather than reporting a
guarantee the system does not have.

#### Returns

`Promise`\<`void`\>

***

### logAuditEvent?

> `optional` __logAuditEvent?__: (`event`) => `Promise`\<`string`\>

Defined in: src/utils/auditEvents.ts:40

#### Parameters

##### event

`Record`\<`string`, `unknown`\>

#### Returns

`Promise`\<`string`\>
