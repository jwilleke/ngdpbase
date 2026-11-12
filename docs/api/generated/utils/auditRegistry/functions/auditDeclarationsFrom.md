[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditRegistry](../README.md) / auditDeclarationsFrom

# Function: auditDeclarationsFrom()

> __auditDeclarationsFrom__(`read`): `Record`\<`string`, [`AuditEventDeclaration`](../interfaces/AuditEventDeclaration.md)\>

Defined in: src/utils/auditRegistry.ts:102

Every declared event in a configuration (#1638): the entries of
`ngdpbase.audit.events`, plus every permission entry carrying `audit`, under
the permission's name. A permission's `audit.description` defaults to the
permission's own description.

A name in both places is a declaration made twice. The shipped file never
does it (`npm run lint:audit` fails); an operator's custom file that still
sets a moved event under `ngdpbase.audit.events` is honoured — its fields
override the permission's — and said once, so it is never silent.

## Parameters

### read

[`AuditEventsSource`](../type-aliases/AuditEventsSource.md)

## Returns

`Record`\<`string`, [`AuditEventDeclaration`](../interfaces/AuditEventDeclaration.md)\>
