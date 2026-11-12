[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuditManager](../README.md) / AuditQueryCaller

# Type Alias: AuditQueryCaller

> __AuditQueryCaller__ = [`PermissionSubject`](../../UserManager/interfaces/PermissionSubject.md)

Defined in: src/managers/AuditManager.ts:221

Who is asking for audit records (#1116): the request's subject (#1762
slice 4), so the decision is the PDP's for the subject as it is — under a
proxy grant, bounded by the grant and the actor — and the export row names
both people. The permission decision is derived inside AuditManager, never
passed in.
