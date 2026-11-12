[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEvents](../README.md) / AuditEvent

# Interface: AuditEvent

Defined in: src/utils/auditEvents.ts:71

## Properties

### action

> __action__: `string`

Defined in: src/utils/auditEvents.ts:85

***

### actor?

> `optional` __actor?__: `string`

Defined in: src/utils/auditEvents.ts:83

Who actually did it, when that is not `user` (#1762): `user` is the
account acted on — the person represented — and `actor` the person
signed in. Absent on a row with no proxy claim, never a copy of `user`.
Comes from `actorOf` / `proxyAttribution` (slice 3); the proxy-grant
events also set it for the person who made or ended the grant (slice 1).
The audit search filters on it (`?actor=`).

***

### eventType

> __eventType__: [`RecordableAuditEventName`](../../auditEventNames/type-aliases/RecordableAuditEventName.md)

Defined in: src/utils/auditEvents.ts:73

A core name (`AUDIT_EVENT.KEY`), or an addon's name from `addonAuditEventName` (#1638).

***

### ipAddress

> __ipAddress__: `string` \| `undefined`

Defined in: src/utils/auditEvents.ts:84

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/auditEvents.ts:89

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/utils/auditEvents.ts:94

Why, for a decision or a refusal.

***

### resource?

> `optional` __resource?__: `string`

Defined in: src/utils/auditEvents.ts:91

What the action was about, where there is a single subject (a share id, a page).

***

### resourceType?

> `optional` __resourceType?__: `string`

Defined in: src/utils/auditEvents.ts:92

***

### result

> __result__: `"allow"` \| `"deny"` \| `"error"` \| `"success"` \| `"failure"` \| `"logout"`

Defined in: src/utils/auditEvents.ts:87

How it went. Mutations record `success`; decisions record `allow` / `deny`; sign-in records `failure` / `logout`.

***

### sessionId?

> `optional` __sessionId?__: `string`

Defined in: src/utils/auditEvents.ts:96

The session the action ran in, where one is known.

***

### severity

> __severity__: [`AuditSeverity`](../type-aliases/AuditSeverity.md)

Defined in: src/utils/auditEvents.ts:88

***

### user

> __user__: `string`

Defined in: src/utils/auditEvents.ts:74
