[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditLifecycle](../README.md) / buildLifecycleAuditEvent

# Function: buildLifecycleAuditEvent()

> __buildLifecycleAuditEvent__(`input`): [`AuditEvent`](../../auditEvents/interfaces/AuditEvent.md)

Defined in: src/utils/auditLifecycle.ts:98

Build the audit event for a process starting or stopping.

`previousRun` appears on a start only, following the rule `page-rename` and
`token-mint` already use: a field present on every event is useless as a
filter. A shutdown is a statement about itself and makes no claim about the
past.

## Parameters

### input

[`LifecycleEventInput`](../interfaces/LifecycleEventInput.md)

## Returns

[`AuditEvent`](../../auditEvents/interfaces/AuditEvent.md)
