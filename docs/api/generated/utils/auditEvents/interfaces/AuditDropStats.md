[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AuditDropStats

# Interface: AuditDropStats

Defined in: src/utils/auditEvents.ts:369

Audit writes that were attempted and lost (#1109).

Every audit write here is fire-and-forget with a caught error, deliberately:
losing the log is bad, but refusing a page save or a token mint because the
log failed is worse. The consequence is that a request can land its write and
lose its audit entry — a page edited with no history, or a credential minted
with no record it exists.

That trade is defensible. What is not is leaving its only trace in a
`logger.warn` nobody reads: an accepted risk nobody can see is
indistinguishable from an unnoticed bug. So the drops are counted, the last
one is described, and the count is surfaced where an operator already looks.

## Properties

### dropped

> __dropped__: `number`

Defined in: src/utils/auditEvents.ts:371

Audit writes attempted and lost since boot.

***

### lastAt

> __lastAt__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:377

ISO timestamp of the most recent loss, or null.

***

### lastError

> __lastError__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:375

Message of the most recent failure, or null.

***

### lastEventType

> __lastEventType__: `string` \| `null`

Defined in: src/utils/auditEvents.ts:373

`eventType` of the most recent loss, or null.
