[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / buildAttachmentAuditEvent

# Function: buildAttachmentAuditEvent()

> __buildAttachmentAuditEvent__(`input`): [`AuditEvent`](../interfaces/AuditEvent.md)

Defined in: src/utils/auditEvents.ts:313

Build the audit event for an attachment upload or delete.

A delete outranks an upload because it is the one that loses data, and a
token-driven delete matches `page-delete`'s `high` for the same reason:
unattended destruction is the case someone reviewing the log is looking for.

## Parameters

### input

[`AttachmentInput`](../type-aliases/AttachmentInput.md)

## Returns

[`AuditEvent`](../interfaces/AuditEvent.md)
