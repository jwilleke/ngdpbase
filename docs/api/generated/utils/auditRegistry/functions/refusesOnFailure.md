[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditRegistry](../README.md) / refusesOnFailure

# Function: refusesOnFailure()

> __refusesOnFailure__(`eventType`): `boolean`

Defined in: src/utils/auditRegistry.ts:186

Does this event refuse the action when its record cannot be written
(#1121, #1158)?

Two layers need the same answer and must not be able to disagree:
`recordAuditEvent` decides whether a failure rejects the action, and
`FileAuditProvider.writeEvent` decides whether the record is fsynced before
the write resolves. A rule that meant one thing to the caller and another to
the writer would be the #1148 defect again.

## Parameters

### eventType

`string`

## Returns

`boolean`
