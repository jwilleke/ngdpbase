[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / buildPageViewAuditEvent

# Function: buildPageViewAuditEvent()

> __buildPageViewAuditEvent__(`input`): [`AuditEvent`](../interfaces/AuditEvent.md)

Defined in: src/utils/auditEvents.ts:286

Build the audit event for a page view (#1129).

Emission is a deployment posture: `page-read` ships `enabled: false` in
`ngdpbase.audit.events` (#1203), and `recordAuditEvent` honours the switch.
Off, a general-purpose deployment does not drown its log in reads; on, a
records-style deployment gets the access accounting — who looked at what —
that read auditing exists for.

## Parameters

### input

[`PageViewInput`](../interfaces/PageViewInput.md)

## Returns

[`AuditEvent`](../interfaces/AuditEvent.md)
