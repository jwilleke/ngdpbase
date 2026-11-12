[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuditManager](../README.md) / AuditQueryForbiddenError

# Class: AuditQueryForbiddenError

Defined in: src/managers/AuditManager.ts:14

The caller may not query the audit log (#1116, #1165).

A distinct type rather than a bare Error so a route can tell an
authorization refusal from a genuine fault. #1165 was hard to diagnose
precisely because it could not: the route's catch-all turned this refusal
into `500 Error loading audit logs`, so "you may not read this" and
"auditing is broken" were the same plain-text page.

Matching on the message string would work today and break the first time
somebody rewords it, which is why this is a type.

## Extends

- `Error`

## Constructors

### Constructor

> __new AuditQueryForbiddenError__(`message`): `AuditQueryForbiddenError`

Defined in: src/managers/AuditManager.ts:15

#### Parameters

##### message

`string`

#### Returns

`AuditQueryForbiddenError`

#### Overrides

`Error.constructor`
