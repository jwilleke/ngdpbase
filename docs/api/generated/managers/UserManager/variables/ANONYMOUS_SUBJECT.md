[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UserManager](../README.md) / ANONYMOUS\_SUBJECT

# Variable: ANONYMOUS\_SUBJECT

> `const` __ANONYMOUS\_SUBJECT__: [`PermissionSubject`](../interfaces/PermissionSubject.md)

Defined in: src/managers/UserManager.ts:132

The subject for a check about nobody in particular (#1164).

There is one honest reason to hand `hasPermission` a subject you built:
asking what an ANONYMOUS visitor may do, where there is no user and no token
by definition. Naming it once keeps that case explicit and keeps
`check-permission-subject.ts` free to reject every inline literal — an
escape hatch nobody can reach by accident.
