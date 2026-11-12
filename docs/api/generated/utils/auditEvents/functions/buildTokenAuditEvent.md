[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / buildTokenAuditEvent

# Function: buildTokenAuditEvent()

> __buildTokenAuditEvent__(`input`): [`AuditEvent`](../interfaces/AuditEvent.md)

Defined in: src/utils/auditEvents.ts:526

Build the audit event for an agent token mint, extend or revoke (#1111, #1734).

Before this, the token store was the only record that a credential had ever
existed — and `purgeExpired()` claimed otherwise in a comment ("Audit is
unaffected") while nothing emitted anything. That made `retention-days`
load-bearing by accident: hash-bearing records were kept a month past
usefulness purely so somebody could answer "what could this token do, and
who stopped it?" With the lifecycle audited, the store can keep only what it
needs to authenticate.

Emitted from the manager rather than the route, unlike `page.*`. A page
mutation logged at the HTTP layer misses an internal caller and that is
survivable; an unaudited mint is a credential nobody knows exists.

`scopes` appear on a mint only, `expiresAt` on a mint and an extend (with
`previousExpiresAt` on an extend, #1734), and `revokedBy` on a revoke only —
the same rule `page-rename` follows for `fromPageName`. A field present on
every event is useless as a filter.

## Parameters

### input

[`TokenInput`](../interfaces/TokenInput.md)

## Returns

[`AuditEvent`](../interfaces/AuditEvent.md)
