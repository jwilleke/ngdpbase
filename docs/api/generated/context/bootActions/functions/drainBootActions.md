[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/bootActions](../README.md) / drainBootActions

# Function: drainBootActions()

> __drainBootActions__(`sink`): `Promise`\<`number`\>

Defined in: src/context/bootActions.ts:112

Flush the boot ledger into the sink. Called once by `AuditManager.initialize`. Returns how many.

## Parameters

### sink

[`AuditEventSink`](../../../utils/auditEvents/interfaces/AuditEventSink.md)

## Returns

`Promise`\<`number`\>
