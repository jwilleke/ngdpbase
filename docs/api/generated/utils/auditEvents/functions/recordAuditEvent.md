[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / recordAuditEvent

# Function: recordAuditEvent()

> __recordAuditEvent__(`sink`, `event`, `onError?`): `Promise`\<[`AuditRecordOutcome`](../type-aliases/AuditRecordOutcome.md)\>

Defined in: src/utils/auditEvents.ts:439

## Parameters

### sink

[`AuditEventSink`](../interfaces/AuditEventSink.md) \| `null` \| `undefined`

### event

[`AuditEvent`](../interfaces/AuditEvent.md)

### onError?

(`err`) => `void`

## Returns

`Promise`\<[`AuditRecordOutcome`](../type-aliases/AuditRecordOutcome.md)\>
