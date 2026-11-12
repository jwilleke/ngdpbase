[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / buildPageMutationAuditEvent

# Function: buildPageMutationAuditEvent()

> __buildPageMutationAuditEvent__(`input`): [`AuditEvent`](../interfaces/AuditEvent.md)

Defined in: src/utils/auditEvents.ts:231

Build the audit event for a page create, edit, rename, or link rewrite.

`result` is always `success`: these are recorded *after* the write lands,
unlike `page-delete`, which logs `attempted` before unlinking so that a
crash mid-delete still leaves a trace. A create or edit has the page file
and its version history as its own record, so recording the attempt buys
nothing the file does not already say.

## Parameters

### input

[`PageMutationInput`](../interfaces/PageMutationInput.md)

## Returns

[`AuditEvent`](../interfaces/AuditEvent.md)
