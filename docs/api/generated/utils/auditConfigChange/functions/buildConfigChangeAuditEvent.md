[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditConfigChange](../README.md) / buildConfigChangeAuditEvent

# Function: buildConfigChangeAuditEvent()

> __buildConfigChangeAuditEvent__(`input`): [`AuditEvent`](../../auditEvents/interfaces/AuditEvent.md)

Defined in: src/utils/auditConfigChange.ts:100

Build the audit event for a configuration change.

A secret key records __that it changed and neither value__. An entry naming
a key alongside its before and after values would reintroduce the disclosure
`ngdpbase.config.sensitive-values` (its `secret` entries) exists to prevent, by a different route and
into a file with a longer retention than the logs it already guards.

Severity is uniform. Grading a security-relevant key higher would need a
list of which keys those are, and inventing one here — ahead of the posture
ingredient list in D15 — would be a second, drifting definition of the same
thing.

## Parameters

### input

[`ConfigChangeInput`](../interfaces/ConfigChangeInput.md)

## Returns

[`AuditEvent`](../../auditEvents/interfaces/AuditEvent.md)
